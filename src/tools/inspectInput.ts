import { z } from 'zod';

const project = z.object({ kind: z.literal('project'), project: z.string().describe('Project id') }).describe('A project: its environments and flag naming pattern');

const query = z.discriminatedUnion('kind', [project]);

export const inspectInput = {
  queries: z.array(query).min(1).describe('Run together; one result per query, in the order asked'),
};

export type InspectInput = z.infer<z.ZodObject<typeof inspectInput>>;
export type Query = z.infer<typeof query>;
export type ProjectQuery = z.infer<typeof project>;
