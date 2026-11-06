import { z } from 'zod';

const project = z
  .object({ kind: z.literal('project'), project: z.string().describe('Project id, as a projects search returns it') })
  .describe('A project: its environments, default stickiness and flag naming pattern');
const flag = z
  .object({
    kind: z.literal('flag'),
    project: z.string().describe('Project id, as a projects search returns it'),
    flag: z.string().describe('Feature flag name, as a flags search returns it'),
  })
  .describe(
    'A feature flag: what it is, its lifecycle, who made and changed it, where SDKs last saw it, its parent and child flags, tags, links and change requests waiting with changes to it',
  );

const contextFieldInclude = z
  .enum(['usage'])
  .describe(
    'usage: the flags constraining on the field. Costs Unleash a scan of every strategy, so ask only before changing or deleting the field',
  );

const contextField = z
  .object({
    kind: z.literal('context_field'),
    project: z.string().optional().describe('Project id of a project field; leave out for a global field'),
    name: z.string().describe('Context field name, as a context fields search returns it'),
    include: z
      .array(contextFieldInclude)
      .optional()
      .describe('Parts that cost Unleash an extra request, left out unless named'),
  })
  .describe(
    'A context field: what it holds, the values it allows, whether it can drive stickiness, and on request which flags use it',
  );

const segmentInclude = z
  .enum(['usage'])
  .describe('usage: the flags whose targets use the segment. Ask before changing or deleting the segment');

const segment = z
  .object({
    kind: z.literal('segment'),
    id: z.number().int().describe('Segment id, as a segments search returns it and targets refer to it'),
    include: z.array(segmentInclude).optional().describe('Parts that cost an extra request, left out unless named'),
  })
  .describe('A segment: the constraints it stands for, its project, who made it, and on request which flags use it');

const flagExposureMetrics = z
  .object({
    kind: z.literal('flag_exposure_metrics'),
    project: z.string().describe('Project id, as a flags search returns it'),
    flag: z.string().describe('Feature flag name, as a flags search returns it'),
    environment: z.string().describe('Environment name, as inspecting the flag lists them'),
    hoursBack: z
      .number()
      .int()
      .min(1)
      .max(30 * 24)
      .default(48)
      .describe('The window, ending now; at most 30 days'),
    include: z
      .array(z.enum(['series']))
      .optional()
      .describe(
        'series: the counts per hour, or per UTC day beyond 48 hours. Costs many tokens, so ask only for a question about when something changed',
      ),
  })
  .describe(
    'Exposure metrics: how often SDKs evaluated a flag in an environment and how often they got it, as the Unleash exposure metrics page shows; whether SDKs saw a flag at all, inspecting the flag tells',
  );

const releaseTemplateInclude = z
  .enum(['targets'])
  .describe(
    'targets: the audiences each milestone gives the feature to. Costs many tokens, so ask only to compare or reuse audiences',
  );

const releaseTemplate = z
  .object({
    kind: z.literal('release_template'),
    id: z.string().describe('Release template id, as a release templates search returns it; global or in a project'),
    include: z.array(releaseTemplateInclude).optional().describe('Parts that cost many tokens, left out unless named'),
  })
  .describe(
    'A release template: its milestones in order, when each moves on by itself, and on request who each one gives the feature to',
  );

const query = z.discriminatedUnion('kind', [
  project,
  flag,
  contextField,
  segment,
  flagExposureMetrics,
  releaseTemplate,
]);

export const inspectInput = {
  queries: z
    .array(query)
    .min(1)
    .max(10)
    .describe('Run together, at most 10 per call; one result per query, in the order asked'),
};

export type InspectInput = z.infer<z.ZodObject<typeof inspectInput>>;
export type Query = z.infer<typeof query>;
export type ProjectQuery = z.infer<typeof project>;
export type FlagQuery = z.infer<typeof flag>;
export type ContextFieldQuery = z.infer<typeof contextField>;
export type SegmentQuery = z.infer<typeof segment>;
export type FlagExposureMetricsQuery = z.infer<typeof flagExposureMetrics>;
export type ReleaseTemplateQuery = z.infer<typeof releaseTemplate>;
