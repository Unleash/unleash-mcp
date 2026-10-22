import { z } from 'zod';

const segments = z.object({
  kind: z.literal('segments'),
  project: z.string().optional().describe('Project id; keeps the segments usable there, global or owned by it'),
  query: z.string().optional().describe('Case-insensitive text the name contains; leave out to list all'),
}).describe('Segments by name, with the ids targets and inspect take');

const query = z.discriminatedUnion('kind', [segments]);

export const searchInput = {
  queries: z.array(query).min(1).describe('Run together; one result per query, in the order asked'),
};

export type SearchInput = z.infer<z.ZodObject<typeof searchInput>>;
export type Query = z.infer<typeof query>;
export type SegmentsQuery = z.infer<typeof segments>;
