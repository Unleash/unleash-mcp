import { z } from 'zod';

const project = z.object({ kind: z.literal('project'), project: z.string().describe('Project id') }).describe('What the project has');

const query = z.discriminatedUnion('kind', [project]);

export const searchInput = {
  queries: z.array(query).min(1).describe('Run together; one result per query, in the order asked'),
};

export type SearchInput = z.infer<z.ZodObject<typeof searchInput>>;
export type Query = z.infer<typeof query>;
export type ProjectQuery = z.infer<typeof project>;
