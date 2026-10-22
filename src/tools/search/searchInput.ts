import { z } from 'zod';

const segments = z.object({
  kind: z.literal('segments'),
  project: z.string().optional().describe('Project id; keeps the segments usable there, global or owned by it'),
  query: z.string().optional().describe('Case-insensitive text the name contains; leave out to list all'),
}).describe('Segments by name, with the ids targets and inspect take. To find segments by scope, author, creation date or how many projects and flags use them, search all and filter the rows yourself');

const contextFields = z.object({
  kind: z.literal('context_fields'),
  project: z.string().optional().describe('Project id; keeps the fields usable there, global or owned by it'),
  query: z.string().optional().describe('Case-insensitive text the name contains; leave out to list all'),
}).describe('Context fields by name, with what constraints and configure need. To find fields by scope, stickiness, creation date or how many projects and flags use them, search all and filter the rows yourself; legal values are on inspect');

const projects = z.object({
  kind: z.literal('projects'),
  query: z.string().optional().describe('Case-insensitive text the id or name contains; leave out to list all'),
}).describe('Projects by id or name, with the ids the other queries and tools take');

const query = z.discriminatedUnion('kind', [projects, segments, contextFields]);

export const searchInput = {
  queries: z.array(query).min(1).describe('Run together; one result per query, in the order asked'),
};

export type SearchInput = z.infer<z.ZodObject<typeof searchInput>>;
export type Query = z.infer<typeof query>;
export type ProjectsQuery = z.infer<typeof projects>;
export type SegmentsQuery = z.infer<typeof segments>;
export type ContextFieldsQuery = z.infer<typeof contextFields>;
