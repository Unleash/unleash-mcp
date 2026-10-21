import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askForProjectId,
  handleToolError,
  resolveProjectId,
  type ServerContext,
  toolErrorPayload,
} from '../context.js';
import type { ContextField, StrategyConstraint } from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { jsonResult } from '../utils/toolResult.js';
import {
  CONTEXT_DOCS,
  type ConstraintInput,
  type ConstraintProblem,
  constraintSchema,
  invalidConstraint,
  shapeConstraint,
} from './constraints.js';

const contextFieldInputSchema = z.strictObject({
  name: z
    .string()
    .min(1)
    .max(100)
    .refine((name) => encodeURIComponent(name) === name && name !== '.' && name !== '..', {
      message:
        'Context field names must be URL-friendly, such as "devMode" or "user-tier", with no spaces or slashes.',
    })
    .describe('Context field name, such as "devMode"'),
  description: z.string().max(250).optional().describe('What the field holds'),
  legalValues: z
    .array(
      z.strictObject({
        value: z.string().min(1).max(100),
        description: z.string().optional(),
      }),
    )
    .refine((values) => new Set(values.map(({ value }) => value)).size === values.length, {
      message: 'Each legal value can appear only once.',
    })
    .optional()
    .describe(
      'The only values the field accepts, such as "true" and "false". Leave out to allow any.',
    ),
  stickiness: z
    .boolean()
    .optional()
    .describe('Let flags use this field as stickiness, to keep a user in the same bucket'),
  sortOrder: z.number().int().optional().describe('Where the field sorts in lists in Unleash'),
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

type ContextFieldInput = z.infer<typeof contextFieldInputSchema>;
type SegmentInput = z.infer<typeof segmentInputSchema>;
type Item = { kind: 'contextField' | 'segment'; name: string };
type Owner = { scope: 'project'; project: string } | { scope: 'global' };
type Problem = Item & { code: string; message: string; hint: string; options?: string[] };

const PROJECT_CONTEXT_SINCE = '7.4.1';

const projectContextUnsupported = (projectId: string) =>
  new CustomError(
    'HTTP_404',
    `Unleash has no project context endpoint for "${projectId}": Unleash is older than ${PROJECT_CONTEXT_SINCE}, which added project context fields.`,
    'Ask the user whether they want a global field instead (scope: "global").',
  );

const where = (owner: Owner): string =>
  owner.scope === 'project' ? `in project "${owner.project}"` : 'that every project can use';

async function resolveOwner(
  context: ServerContext,
  input: z.infer<typeof createTargetingSchema>,
): Promise<Owner | undefined> {
  if (input.scope === 'global') {
    if (input.projectId) {
      throw new CustomError(
        'INVALID_SCOPE',
        `scope "global" cannot be combined with projectId "${input.projectId}": a global field or segment belongs to no project.`,
        `Drop projectId to create it for every project, or drop scope to create it in project "${input.projectId}".`,
      );
    }
    return { scope: 'global' };
  }

  const project = await resolveProjectId(input.projectId, context);
  return project ? { scope: 'project', project } : undefined;
}

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

async function existingContextFields(
  context: ServerContext,
  owner: Owner,
  fields: ContextFieldInput[],
  segments: SegmentInput[],
): Promise<ContextField[]> {
  if (context.config.server.dryRun) {
    // Dry run calls no API, so every field a constraint names counts as found.
    return segments.flatMap(({ constraints }) =>
      constraints.map(({ contextName }) => ({ name: contextName })),
    );
  }

  const { unleashClient } = context;
  if (owner.scope === 'global') return unleashClient.getGlobalContextFields();
  try {
    return await unleashClient.getContextFields(owner.project);
  } catch (error) {
    if (!(error instanceof CustomError && error.code === 'HTTP_404')) throw error;
    if (fields.length > 0) throw projectContextUnsupported(owner.project);
    // Unleash before 7.4.1 has no project context endpoint, and every field it has is global.
    return unleashClient.getGlobalContextFields();
  }
}

function fieldTaken(name: string, existing: ContextField | undefined) {
  const owner = existing?.project
    ? ` and belongs to project "${existing.project}"`
    : existing
      ? ' and is global'
      : '';
  return {
    message: `A context field named "${name}" already exists${owner}. Context field names are unique across the whole Unleash instance.`,
    hint: 'Use the existing field, or pick another name.',
  };
}

async function fieldNotFound(
  context: ServerContext,
  contextName: string,
  usable: ContextField[],
  owner: Owner,
): Promise<ConstraintProblem> {
  const message = `"${contextName}" is not a context field ${where(owner)}.`;
  const options = [...new Set(usable.map(({ name }) => name))];
  const differentCase = usable.find(({ name }) => name.toLowerCase() === contextName.toLowerCase());
  if (differentCase) {
    return {
      code: 'CONTEXT_FIELD_NOT_FOUND',
      message,
      hint: `Context field names are case-sensitive; did you mean "${differentCase.name}"?`,
      options,
    };
  }

  const elsewhere = await context.unleashClient
    .findContextField(contextName)
    .catch(() => undefined);
  return {
    code: 'CONTEXT_FIELD_NOT_FOUND',
    message,
    hint: elsewhere?.project
      ? `"${contextName}" belongs to project "${elsewhere.project}", so the name is taken. Use one of the listed fields, or ask the user for another name to create.`
      : `Use one of the listed fields, add "${contextName}" to contextFields in this call, or create it in Unleash (${context.config.unleash.baseUrl}/context/create). A constraint on it only matches when the app also sends "${contextName}" in its Unleash context. See ${CONTEXT_DOCS}.`,
    options,
  };
}

/** Unleash cannot check legal values of a field that does not exist yet, so check them here. */
function outsideLegalValues(
  constraint: StrategyConstraint,
  field: ContextField,
): ConstraintProblem | undefined {
  const legal = field.legalValues?.map(({ value }) => value) ?? [];
  if (legal.length === 0) return undefined;

  const given = constraint.values ?? (constraint.value !== undefined ? [constraint.value] : []);
  const outside = given.filter((value) => !legal.includes(value));
  if (outside.length === 0) return undefined;
  return {
    code: 'INVALID_CONSTRAINT',
    message: `${outside.map((value) => `"${value}"`).join(', ')} not in the legal values of "${field.name}".`,
    hint: `"${field.name}" only accepts the listed values.`,
    options: legal,
  };
}

/** Unleash accepts a constraint on any field name, so a misspelt one gives a segment that never matches. */
async function checkConstraint(
  context: ServerContext,
  input: ConstraintInput,
  usable: ContextField[],
  owner: Owner,
): Promise<{ constraint: StrategyConstraint } | { problem: ConstraintProblem }> {
  const field = usable.find(({ name }) => name === input.contextName);
  if (!field) return { problem: await fieldNotFound(context, input.contextName, usable, owner) };

  const shaped = shapeConstraint(input);
  if ('problem' in shaped) return shaped;

  const invalid =
    (await invalidConstraint(context.unleashClient, shaped.constraint, field)) ??
    outsideLegalValues(shaped.constraint, field);
  return invalid ? { problem: invalid } : shaped;
}

const repeated = (item: Item): Problem => ({
  ...item,
  code: 'DUPLICATE_NAME',
  message: `"${item.name}" appears more than once.`,
  hint: 'Merge its entries into one.',
});

/** Checks every item against Unleash before anything is written. */
async function plan(
  context: ServerContext,
  owner: Owner,
  fields: ContextFieldInput[],
  segments: SegmentInput[],
): Promise<{ problems: Problem[]; constraints: StrategyConstraint[][] }> {
  const { unleashClient, config } = context;
  const [takenFields, existingSegments, existingFields] = await Promise.all([
    Promise.all(fields.map(({ name }) => unleashClient.findContextField(name))),
    segments.length > 0 && !config.server.dryRun ? unleashClient.listSegments() : [],
    segments.length > 0 ? existingContextFields(context, owner, fields, segments) : [],
  ]);
  // New fields first, so a dry run checks a constraint against the legal values of a new field.
  const usable: ContextField[] = [
    ...fields.map(({ name, legalValues }) => ({ name, legalValues })),
    ...existingFields,
  ];

  const problems: Problem[] = [];
  const fieldNames = new Set<string>();
  for (const [index, field] of fields.entries()) {
    const item: Item = { kind: 'contextField', name: field.name };
    if (fieldNames.has(field.name)) problems.push(repeated(item));
    fieldNames.add(field.name);
    if (takenFields[index]) {
      problems.push({
        ...item,
        code: 'CONTEXT_FIELD_EXISTS',
        ...fieldTaken(field.name, takenFields[index]),
      });
    }
  }

  const segmentNames = new Set<string>();
  for (const segment of segments) {
    const item: Item = { kind: 'segment', name: segment.name };
    if (segmentNames.has(segment.name)) problems.push(repeated(item));
    segmentNames.add(segment.name);
    const taken = existingSegments.find(({ name }) => name === segment.name);
    if (taken) {
      problems.push({
        ...item,
        code: 'SEGMENT_EXISTS',
        message: `A segment named "${segment.name}" already exists ${taken.project ? `in project "${taken.project}"` : 'for every project'}. Segment names are unique across the whole Unleash instance.`,
        hint: 'Use the existing segment, or pick another name.',
      });
    }
  }

  const checked = await Promise.all(
    segments.map(({ constraints }) =>
      Promise.all(
        constraints.map((constraint) => checkConstraint(context, constraint, usable, owner)),
      ),
    ),
  );
  const constraints: StrategyConstraint[][] = [];
  for (const [index, results] of checked.entries()) {
    const item: Item = { kind: 'segment', name: segments[index].name };
    const shaped: StrategyConstraint[] = [];
    for (const result of results) {
      if ('problem' in result) problems.push({ ...item, ...result.problem });
      else shaped.push(result.constraint);
    }
    constraints.push(shaped);
  }

  return { problems, constraints };
}

function problemsResult(context: ServerContext, problems: Problem[]): CallToolResult {
  context.logger.warn(
    `create_targeting rejected the request: ${problems.map(({ code }) => code).join(', ')}`,
  );
  return {
    isError: true,
    ...jsonResult({
      success: false,
      error: {
        code: 'INVALID_TARGETING',
        message: `Nothing was created. The request has ${problems.length} problem${problems.length === 1 ? '' : 's'}.`,
        hint: 'Fix each problem and call create_targeting again. When a problem lists options, ask the user which one they mean rather than picking one yourself.',
      },
      problems,
    }),
  };
}

async function explainContextFieldError(
  context: ServerContext,
  error: unknown,
  name: string,
  owner: Owner,
): Promise<unknown> {
  if (!(error instanceof CustomError)) return error;
  if (error.code === 'HTTP_409') {
    const existing = await context.unleashClient.findContextField(name).catch(() => undefined);
    const { message, hint } = fieldTaken(name, existing);
    return new CustomError(error.code, message, hint);
  }
  if (error.code === 'HTTP_404' && owner.scope === 'project') {
    return projectContextUnsupported(owner.project);
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
    const fields = input.contextFields ?? [];
    const segments = input.segments ?? [];

    const owner = await resolveOwner(context, input);
    if (!owner) return askForProjectId(context);
    if (owner.scope === 'project') await checkProjectExists(context, owner.project);

    const { problems, constraints } = await plan(context, owner, fields, segments);
    if (problems.length > 0) return problemsResult(context, problems);

    const mode = context.config.server.dryRun ? '[DRY RUN] ' : '';
    const total = fields.length + segments.length;
    const created: Item[] = [];
    await context.notifyProgress(
      progressToken,
      0,
      total,
      `${mode}Creating context fields and segments...`,
    );

    for (const [index, field] of fields.entries()) {
      try {
        if (owner.scope === 'project') {
          await context.unleashClient.createProjectContextField(owner.project, field);
        } else {
          await context.unleashClient.createGlobalContextField(field);
        }
      } catch (error) {
        const notAttempted: Item[] = [
          ...fields.slice(index + 1).map(({ name }) => ({ kind: 'contextField' as const, name })),
          ...segments.map(({ name }) => ({ kind: 'segment' as const, name })),
        ];
        return failure(
          context,
          await explainContextFieldError(context, error, field.name, owner),
          { kind: 'contextField', name: field.name },
          owner,
          created,
          notAttempted,
        );
      }
      created.push({ kind: 'contextField', name: field.name });
      await context.notifyProgress(
        progressToken,
        created.length,
        total,
        `${mode}Created ${field.name}`,
      );
    }

    for (const [index, segment] of segments.entries()) {
      try {
        await context.unleashClient.createSegment({
          name: segment.name,
          description: segment.description,
          ...(owner.scope === 'project' && { project: owner.project }),
          constraints: constraints[index],
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
      await context.notifyProgress(
        progressToken,
        created.length,
        total,
        `${mode}Created ${segment.name}`,
      );
    }

    context.logger.info(
      `${mode}Created ${created.map(({ name }) => name).join(', ')} ${where(owner)}`,
    );
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
    'Nothing was rolled back: everything in created exists in Unleash, and nothing in notAttempted was sent. Check whether the failed item exists in Unleash before retrying it, since a network error or timeout can leave it created. Then call create_targeting again with only the items that are missing.';
  return {
    isError: true,
    ...jsonResult({
      success,
      error: {
        ...normalized,
        hint: [normalized.hint, nothingRolledBack].filter(Boolean).join(' '),
      },
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

Context fields come before segments in one call, so you can create a field and a segment that uses it together. Context field and segment names are unique across the whole Unleash instance, even in a project.

Nothing is created until every name and constraint checks out; otherwise the error lists every problem. Each item is then its own API call and nothing is rolled back: a failure partway through stops the call, and the reply lists what was created and which item failed.

Afterwards, pass the field name as contextName in a constraint, or the segment name in segments, when you call set_flag_rollout. Project context fields need Unleash ${PROJECT_CONTEXT_SINCE} or later.`,
  inputSchema: createTargetingSchema,
  implementation: createTargeting,
};
