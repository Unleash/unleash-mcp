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

// The four ways the UI lets several values match; its single-value include and do-not-include are any and none.
export const match = z.enum(['any', 'all', 'none', 'notAll']).describe('any: has at least one; all: has every one; none: has not one of them; notAll: lacks at least one');
const matching = <T extends z.ZodType>(item: T) => z.object({ match, of: z.array(item).min(1) });

const flags = z.object({
  kind: z.literal('flags'),
  project: z.string().optional().describe('Project id; leave out to search every project'),
  query: z.string().optional().describe('Case-insensitive text the name or a tag contains; leave out to list all'),
  stages: z.array(lifecycleStage).min(1).optional().describe('Keeps flags in any of these lifecycle stages; archived flags only come back when archived is listed'),
  segments: matching(z.string()).optional().describe('Keeps flags whose targets match these segments, by exact name as a segments search returns it'),
  tags: matching(z.object({ type: z.string(), value: z.string() })).optional().describe('Keeps flags whose tags match these, as flag rows return them'),
  // A flag has one creator, so all and notAll could never differ from any and none; the shared match stays for lists.
  createdBy: z.object({
    match: z.enum(['any', 'none']).describe('any: created by one of them; none: created by none of them'),
    of: z.array(z.number().int()).min(1).describe('User ids, as a flag_creators search returns them'),
  }).optional().describe('Keeps flags by who created them. Run a flag_creators query first to find the ids by name'),
  createdAt: z.object({
    match: z.enum(['before', 'onOrAfter']).describe('before: created before the day; onOrAfter: created on the day or later'),
    date: z.iso.date().describe('A day, YYYY-MM-DD'),
  }).optional().describe('Keeps flags by the day they were created; one bound, as the UI offers'),
  offset: z.number().int().min(0).default(0).describe('Flags to skip; page with offset and limit until total is reached'),
  limit: z.number().int().min(1).max(50).default(20).describe('Flags per page'),
}).describe('Flags by name or tag, paged. Unleash pages and matches; rows carry type, lifecycle stage, tags and where the flag is enabled');

const flagCreators = z.object({
  kind: z.literal('flag_creators'),
  query: z.string().optional().describe('Case-insensitive text the name contains, or the username or email starts with; leave out to list all'),
  offset: z.number().int().min(0).default(0).describe('Creators to skip; page with offset and limit until total is reached'),
  limit: z.number().int().min(1).max(50).default(20).describe('Creators per page'),
}).describe('Users who created a flag in a project the token can see, paged, with their ids. Unleash matches and pages');

const query = z.discriminatedUnion('kind', [projects, flags, segments, contextFields, flagCreators]);

export const searchInput = {
  queries: z.array(query).min(1).describe('Run together; one result per query, in the order asked'),
};

export type SearchInput = z.infer<z.ZodObject<typeof searchInput>>;
export type Query = z.infer<typeof query>;
export type ProjectsQuery = z.infer<typeof projects>;
export type FlagsQuery = z.infer<typeof flags>;
export type Match = z.infer<typeof match>;
export type SegmentsQuery = z.infer<typeof segments>;
export type ContextFieldsQuery = z.infer<typeof contextFields>;
export type FlagCreatorsQuery = z.infer<typeof flagCreators>;
