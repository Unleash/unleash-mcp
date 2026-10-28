import { z } from 'zod';

const project = z
  .object({ kind: z.literal('project'), project: z.string().describe('Project id, as a projects search returns it') })
  .describe('A project: its environments and flag naming pattern');
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

const query = z.discriminatedUnion('kind', [project, flag, contextField, segment]);

export const inspectInput = {
  queries: z.array(query).min(1).describe('Run together; one result per query, in the order asked'),
};

export type InspectInput = z.infer<z.ZodObject<typeof inspectInput>>;
export type Query = z.infer<typeof query>;
export type ProjectQuery = z.infer<typeof project>;
export type FlagQuery = z.infer<typeof flag>;
export type ContextFieldQuery = z.infer<typeof contextField>;
export type SegmentQuery = z.infer<typeof segment>;
