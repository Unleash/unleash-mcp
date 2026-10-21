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
import { constraintSchema, shapeConstraint } from './setFlagRollout.js';

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
type Created = Item & { project: string | null };

/**
 * Unleash accepts a constraint on any name, so a misspelt field name would give a segment that
 * never matches.
 */
async function checkContextNames(
  context: ServerContext,
  segments: Array<{ constraints: Array<{ contextName: string }> }>,
  newFields: string[],
  projectId: string | undefined,
): Promise<void> {
  if (segments.length === 0 || context.config.server.dryRun) return;

  const existing = await context.unleashClient.getContextFields(projectId);
  const usable = [...existing.map(({ name }) => name), ...newFields];
  for (const { contextName } of segments.flatMap(({ constraints }) => constraints)) {
    if (usable.includes(contextName)) continue;
    const differentCase = usable.find((name) => name.toLowerCase() === contextName.toLowerCase());
    throw new CustomError(
      'CONTEXT_FIELD_NOT_FOUND',
      `Nothing was created: "${contextName}" is not a context field ${projectId ? `that project "${projectId}" can use` : 'that every project can use'}.`,
      differentCase
        ? `Context field names are case-sensitive; did you mean "${differentCase}"?`
        : `Use one of these fields: ${usable.join(', ')}. If none fits, ask the user whether to create "${contextName}" too. A constraint on it only matches when the app sends "${contextName}" in its Unleash context.`,
    );
  }
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
  if (error.code === 'HTTP_404' && projectId) {
    return new CustomError(
      error.code,
      `Unleash has no project context endpoint for "${projectId}": either the project does not exist, or Unleash is older than 7.4.0, which added project context fields.`,
      'Check the project ID, or ask the user whether they want a global field instead (scope: "global").',
    );
  }
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

    const projectId =
      scope === 'project' ? await resolveProjectId(input.projectId, context) : undefined;
    if (scope === 'project' && !projectId) return askForProjectId(context);

    const shaped: Array<{ name: string; constraints: StrategyConstraint[] }> = [];
    for (const segment of segments) {
      const constraints: StrategyConstraint[] = [];
      for (const constraint of segment.constraints) {
        const result = shapeConstraint(constraint, segment.name);
        if ('problem' in result) {
          return handleToolError(
            context,
            new CustomError('INVALID_CONSTRAINT', result.problem.message, result.problem.hint),
            'create_targeting',
          );
        }
        constraints.push(result.constraint);
      }
      shaped.push({ name: segment.name, constraints });
    }
    await checkContextNames(
      context,
      segments,
      fields.map(({ name }) => name),
      projectId,
    );

    const total = fields.length + segments.length;
    const created: Created[] = [];
    const owner = projectId ?? null;
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
          created,
          notAttempted,
        );
      }
      created.push({ kind: 'contextField', name: field.name, project: owner });
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
          created,
          notAttempted,
        );
      }
      created.push({ kind: 'segment', name: segment.name, project: owner });
      await context.notifyProgress(progressToken, created.length, total, `Created ${segment.name}`);
    }

    return jsonResult({ success: true, dryRun: context.config.server.dryRun, created });
  } catch (error) {
    return handleToolError(context, error, 'create_targeting');
  }
}

function failure(
  context: ServerContext,
  error: unknown,
  failed: Item,
  created: Created[],
  notAttempted: Item[],
): CallToolResult {
  return {
    isError: true,
    ...jsonResult({
      ...toolErrorPayload(context, error, 'create_targeting'),
      failed,
      created,
      notAttempted,
      hint: 'Nothing was rolled back: everything in created exists in Unleash, and nothing in notAttempted was sent. Fix the error, then call create_targeting again with only the failed and notAttempted items.',
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
