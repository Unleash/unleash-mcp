import { z } from 'zod';
import { lifecycleStage } from '../shared/lifecycleStage.ts';

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

const flags = z.object({
  kind: z.literal('flags'),
  project: z.string().optional().describe('Project id; leave out to search every project'),
  query: z.string().optional().describe('Case-insensitive text the name or a tag contains; leave out to list all'),
  stages: z.array(lifecycleStage).min(1).optional().describe('Keeps flags in any of these lifecycle stages; archived flags only come back when archived is listed'),
  offset: z.number().int().min(0).default(0).describe('Flags to skip; page with offset and limit until total is reached'),
  limit: z.number().int().min(1).max(50).default(20).describe('Flags per page'),
}).describe('Flags by name or tag, paged. Unleash pages and matches; rows carry type, lifecycle stage, tags and where the flag is enabled');

const query = z.discriminatedUnion('kind', [projects, flags, segments, contextFields]);

export const searchInput = {
  queries: z.array(query).min(1).describe('Run together; one result per query, in the order asked'),
};

export type SearchInput = z.infer<z.ZodObject<typeof searchInput>>;
export type Query = z.infer<typeof query>;
export type ProjectsQuery = z.infer<typeof projects>;
export type FlagsQuery = z.infer<typeof flags>;
export type SegmentsQuery = z.infer<typeof segments>;
export type ContextFieldsQuery = z.infer<typeof contextFields>;
