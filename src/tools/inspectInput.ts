import { z } from 'zod';

const project = z.object({ kind: z.literal('project'), project: z.string().describe('Project id') }).describe('A project: its environments and flag naming pattern');
const flag = z.object({ kind: z.literal('flag'), project: z.string().describe('Project id'), flag: z.string().describe('Feature flag name') }).describe('A feature flag: what it is, its lifecycle, who made and changed it, where SDKs last saw it, its parent and child flags, tags and links');

const query = z.discriminatedUnion('kind', [project, flag]);

export const inspectInput = {
  queries: z.array(query).min(1).describe('Run together; one result per query, in the order asked'),
};

export type InspectInput = z.infer<z.ZodObject<typeof inspectInput>>;
export type Query = z.infer<typeof query>;
export type ProjectQuery = z.infer<typeof project>;
export type FlagQuery = z.infer<typeof flag>;
