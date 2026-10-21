import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askForProjectId,
  handleToolError,
  resolveProjectId,
  type ServerContext,
  toolErrorPayload,
} from '../context.js';
import type { StrategyConstraint } from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { jsonResult } from '../utils/toolResult.js';
import { constraintSchema, shapeConstraint, unknownContextField } from './constraints.js';

const contextFieldInputSchema = z.strictObject({
  name: z.string().min(1).describe('Context field name, such as "devMode"'),
  description: z.string().optional().describe('What the field holds'),
  legalValues: z
    .array(
      z.strictObject({
        value: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .optional()
    .describe(
      'The only values the field accepts, such as "true" and "false". Leave out to allow any.',
    ),
  stickiness: z
    .boolean()
    .optional()
    .describe('Let flags use this field as stickiness, to keep a user in the same bucket'),
});

const segmentInputSchema = z.strictObject({
  name: z.string().min(1).describe('Segment name'),
  description: z.string().optional().describe('Who is in the segment'),
  constraints: z
    .array(constraintSchema)
    .min(1)
    .describe('Conditions on context fields that decide who is in the segment'),
});

const createTargetingSchema = z
  .strictObject({
    projectId: z
      .string()
      .optional()
      .describe('Project that owns what is created (optional if UNLEASH_DEFAULT_PROJECT is set)'),
    scope: z
      .enum(['project', 'global'])
      .optional()
      .describe(
        'project (default) makes everything usable in this project only. global makes it usable in every project.',
      ),
    contextFields: z.array(contextFieldInputSchema).optional().describe('Context fields to create'),
    segments: z.array(segmentInputSchema).optional().describe('Segments to create'),
  })
  .refine((input) => input.contextFields?.length || input.segments?.length, {
    message: 'Pass at least one context field or segment to create.',
  });

type Item = { kind: 'contextField' | 'segment'; name: string };
type Owner = { scope: 'project' | 'global'; project?: string };

const projectContextUnsupported = (projectId: string) =>
  new CustomError(
    'HTTP_404',
    `Unleash has no project context endpoint for "${projectId}": Unleash is older than 7.4.0, which added project context fields.`,
    'Ask the user whether they want a global field instead (scope: "global").',
  );

/** Unleash returns 500 with a raw SQL error when a create names a project that does not exist. */
async function checkProjectExists(context: ServerContext, projectId: string): Promise<void> {
  if (context.config.server.dryRun) return;

  const projects = await context.unleashClient.listProjects();
  if (projects.some(({ id }) => id === projectId)) return;
  throw new CustomError(
    'PROJECT_NOT_FOUND',
    `Nothing was created: there is no project "${projectId}".`,
    'Call list_projects to see the project IDs, or ask the user which project they mean.',
  );
}

/** Unleash accepts a constraint on any name, so a misspelt field name would give a segment that never matches. */
async function usableFieldNames(
  context: ServerContext,
  newFields: string[],
  projectId: string | undefined,
): Promise<string[]> {
  const existing = await context.unleashClient.getContextFields(projectId).catch((error) => {
    throw projectId && error instanceof CustomError && error.code === 'HTTP_404'
      ? projectContextUnsupported(projectId)
      : error;
  });
  return [...existing.map(({ name }) => name), ...newFields];
}

async function explainContextFieldError(
  context: ServerContext,
  error: unknown,
  name: string,
  projectId: string | undefined,
): Promise<unknown> {
  if (!(error instanceof CustomError)) return error;
  if (error.code === 'HTTP_409') {
    const existing = await context.unleashClient.findContextField(name).catch(() => undefined);
    const owner = existing?.project
      ? ` and belongs to project "${existing.project}"`
      : existing
        ? ' and is global'
        : '';
    return new CustomError(
      error.code,
      `A context field named "${name}" already exists${owner}. Context field names are unique across the whole Unleash instance.`,
      'Use the existing field, or pick another name.',
    );
  }
  if (error.code === 'HTTP_404' && projectId) return projectContextUnsupported(projectId);
  return error;
}

export async function createTargeting(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input = createTargetingSchema.parse(args);
    const scope = input.scope ?? 'project';
    const fields = input.contextFields ?? [];
    const segments = input.segments ?? [];

    if (scope === 'global' && input.projectId) {
      throw new CustomError(
        'INVALID_SCOPE',
        `scope "global" cannot be combined with projectId "${input.projectId}": a global field or segment belongs to no project.`,
        `Drop projectId to create it for every project, or drop scope to create it in project "${input.projectId}".`,
      );
    }

    const projectId =
      scope === 'project' ? await resolveProjectId(input.projectId, context) : undefined;
    if (scope === 'project' && !projectId) return askForProjectId(context);
    if (projectId) await checkProjectExists(context, projectId);

    const usable =
      segments.length > 0 && !context.config.server.dryRun
        ? await usableFieldNames(
            context,
            fields.map(({ name }) => name),
            projectId,
          )
        : undefined;
    const where = projectId ? `in project "${projectId}"` : 'that every project can use';
    const baseUrl = context.config.unleash.baseUrl;

    const shaped: Array<{ name: string; constraints: StrategyConstraint[] }> = [];
    for (const segment of segments) {
      const constraints: StrategyConstraint[] = [];
      for (const constraint of segment.constraints) {
        const unknown = usable
          ? unknownContextField(constraint.contextName, usable, where, baseUrl)
          : undefined;
        const result = unknown ?? shapeConstraint(constraint);
        if ('message' in result) {
          const listed = result.options ? ` Fields: ${result.options.join(', ')}.` : '';
          return handleToolError(
            context,
            new CustomError(
              result.code,
              result.message,
              `Nothing was created. ${result.hint}${listed}`,
            ),
            'create_targeting',
          );
        }
        constraints.push(result.constraint);
      }
      shaped.push({ name: segment.name, constraints });
    }

    const total = fields.length + segments.length;
    const created: Item[] = [];
    const owner: Owner = projectId ? { scope, project: projectId } : { scope };
    await context.notifyProgress(
      progressToken,
      0,
      total,
      'Creating context fields and segments...',
    );

    // Context fields first, so a segment in the same call can use them.
    for (const [index, field] of fields.entries()) {
      try {
        await context.unleashClient.createContextField(field, projectId);
      } catch (error) {
        const notAttempted: Item[] = [
          ...fields.slice(index + 1).map(({ name }) => ({ kind: 'contextField' as const, name })),
          ...segments.map(({ name }) => ({ kind: 'segment' as const, name })),
        ];
        return failure(
          context,
          await explainContextFieldError(context, error, field.name, projectId),
          { kind: 'contextField', name: field.name },
          owner,
          created,
          notAttempted,
        );
      }
      created.push({ kind: 'contextField', name: field.name });
      await context.notifyProgress(progressToken, created.length, total, `Created ${field.name}`);
    }

    for (const [index, segment] of segments.entries()) {
      try {
        await context.unleashClient.createSegment({
          name: segment.name,
          description: segment.description,
          project: projectId,
          constraints: shaped[index].constraints,
        });
      } catch (error) {
        const notAttempted = segments
          .slice(index + 1)
          .map(({ name }) => ({ kind: 'segment' as const, name }));
        return failure(
          context,
          error,
          { kind: 'segment', name: segment.name },
          owner,
          created,
          notAttempted,
        );
      }
      created.push({ kind: 'segment', name: segment.name });
      await context.notifyProgress(progressToken, created.length, total, `Created ${segment.name}`);
    }

    return jsonResult({ success: true, dryRun: context.config.server.dryRun, ...owner, created });
  } catch (error) {
    return handleToolError(context, error, 'create_targeting');
  }
}

function failure(
  context: ServerContext,
  error: unknown,
  failed: Item,
  owner: Owner,
  created: Item[],
  notAttempted: Item[],
): CallToolResult {
  const { success, error: normalized } = toolErrorPayload(context, error, 'create_targeting');
  const nothingRolledBack =
    'Nothing was rolled back: everything in created exists in Unleash, and nothing in notAttempted was sent. Fix the error, then call create_targeting again with only the failed and notAttempted items.';
  return {
    isError: true,
    ...jsonResult({
      success,
      error: { ...normalized, hint: `${normalized.hint} ${nothingRolledBack}`.trim() },
      ...owner,
      failed,
      created,
      notAttempted,
    }),
  };
}

export const createTargetingTool = {
  name: 'create_targeting',
  title: 'Create context fields and segments',
  annotations: { readOnlyHint: false, destructiveHint: false },
  description: `Create the context fields and segments that set_flag_rollout targets.

Everything is created in the project by default. Use scope "global" only when the user asks for it or other projects need the same field or segment: a global one shows up in every project.

Context fields come before segments in one call, so you can create a field and a segment that uses it together. Context field names are unique across the whole Unleash instance, even for project fields.

Each item is its own API call and nothing is rolled back. The first failure stops the call; the reply lists what was created and which item failed.

Afterwards, pass the field name as contextName in a constraint, or the segment name in segments, when you call set_flag_rollout. Project context fields need Unleash 7.4.0 or later.`,
  inputSchema: createTargetingSchema,
  implementation: createTargeting,
};
