import { z } from 'zod';
import { lifecycleStage } from '../shared/lifecycleStage.ts';
import { staleness } from '../shared/staleness.ts';
import { tag } from '../shared/tag.ts';

const segments = z
  .object({
    kind: z.literal('segments'),
    project: z.string().optional().describe('Project id; keeps the segments usable there, global or owned by it'),
    query: z.string().optional().describe('Case-insensitive text the name contains; leave out to list all'),
  })
  .describe(
    'Segments by name, with the ids targets, inspect and configure take. To find segments by scope, author, creation date or how many projects and flags use them, search all and filter the rows yourself',
  );

const contextFields = z
  .object({
    kind: z.literal('context_fields'),
    project: z.string().optional().describe('Project id; keeps the fields usable there, global or owned by it'),
    query: z.string().optional().describe('Case-insensitive text the name contains; leave out to list all'),
  })
  .describe(
    'Context fields by name, with what constraints and configure need. To find fields by scope, stickiness, creation date or how many projects and flags use them, search all and filter the rows yourself; legal values are on inspect',
  );

const projects = z
  .object({
    kind: z.literal('projects'),
    query: z.string().optional().describe('Case-insensitive text the id or name contains; leave out to list all'),
  })
  .describe('Projects by id or name, with the ids the other queries and tools take');

// The four ways the UI lets several values match; its single-value include and do-not-include are any and none.
export const match = z
  .enum(['any', 'all', 'none', 'notAll'])
  .describe('any: has at least one; all: has every one; none: has not one of them; notAll: lacks at least one');
const matching = <T extends z.ZodType>(item: T) => z.object({ match, of: z.array(item).min(1) });

const flags = z
  .object({
    kind: z.literal('flags'),
    project: z.string().optional().describe('Project id; leave out to search every project'),
    query: z.string().optional().describe('Case-insensitive text the name or a tag contains; leave out to list all'),
    stages: z
      .array(lifecycleStage)
      .min(1)
      .optional()
      .describe('Keeps flags in any of these lifecycle stages; archived flags only come back when archived is listed'),
    staleness: z
      .array(staleness)
      .min(1)
      .optional()
      .describe(
        'Keeps flags in any of these states: stale is set by a person, potentially_stale is what Unleash marks on its own past the expected lifetime',
      ),
    segments: matching(z.string())
      .optional()
      .describe('Keeps flags whose targets match these segments, by exact name as a segments search returns it'),
    tags: matching(tag).optional().describe('Keeps flags whose tags match these, as flag rows return them'),
    // A flag has one creator, so all and notAll could never differ from any and none; the shared match stays for lists.
    createdBy: z
      .object({
        match: z.enum(['any', 'none']).describe('any: created by one of them; none: created by none of them'),
        of: z.array(z.number().int()).min(1).describe('User ids, as a flag_creators search returns them'),
      })
      .optional()
      .describe('Keeps flags by who created them. Run a flag_creators query first to find the ids by name'),
    createdAt: z
      .object({
        match: z
          .enum(['before', 'onOrAfter'])
          .describe('before: created before the day; onOrAfter: created on the day or later'),
        date: z.iso.date().describe('A day, YYYY-MM-DD'),
      })
      .optional()
      .describe('Keeps flags by the day they were created; one bound, as the UI offers'),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Flags to skip; page with offset and limit until total is reached'),
    limit: z.number().int().min(1).max(50).default(20).describe('Flags per page'),
  })
  .describe(
    'Flags by name or tag, paged. Unleash pages and matches; rows carry type, lifecycle stage, tags and where the flag is enabled',
  );

const flagCreators = z
  .object({
    kind: z.literal('flag_creators'),
    query: z
      .string()
      .optional()
      .describe('Case-insensitive text the name contains, or the username or email starts with; leave out to list all'),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Creators to skip; page with offset and limit until total is reached'),
    limit: z.number().int().min(1).max(50).default(20).describe('Creators per page'),
  })
  .describe(
    'Users who created a flag in a project the token can see, paged, with their ids. Unleash matches and pages',
  );

const tagTypes = z
  .object({
    kind: z.literal('tag_types'),
    query: z.string().optional().describe('Case-insensitive text the name contains; leave out to list all'),
  })
  .describe('Tag types by name: the categories a tag on a flag belongs to, such as simple or team');

const tags = z
  .object({
    kind: z.literal('tags'),
    type: z.string().optional().describe('Tag type to list the tags of; leave out for every type'),
    query: z.string().optional().describe('Case-insensitive text the value contains; leave out to list all'),
  })
  .describe('Tags in use by value, as type and value. Tagging a flag creates the tag; only the type must exist');

const releaseTemplates = z
  .object({
    kind: z.literal('release_templates'),
    project: z
      .string()
      .optional()
      .describe(
        'Project id, as a projects search returns it; keeps the templates usable there, global or owned by it. Leave out for the global ones only',
      ),
    query: z.string().optional().describe('Case-insensitive text the name contains; leave out to list all'),
  })
  .describe('Release templates by name, with the ids release takes. Milestones and their strategies are left out');

const eventTypes = z
  .object({
    kind: z.literal('event_types'),
    query: z
      .string()
      .optional()
      .describe('Case-insensitive text the type contains, such as environment or strategy; leave out to list all'),
  })
  .describe('Unleash event types, the kinds of change audit filters by and returns');

const environments = z
  .object({
    kind: z.literal('environments'),
    query: z.string().optional().describe('Case-insensitive text the name contains; leave out to list all'),
  })
  .describe(
    'Every environment of the instance by name, with its type, such as production. Inspecting a project lists the ones it uses',
  );

const query = z.discriminatedUnion('kind', [
  projects,
  flags,
  segments,
  contextFields,
  tagTypes,
  tags,
  flagCreators,
  releaseTemplates,
  eventTypes,
  environments,
]);

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
export type TagTypesQuery = z.infer<typeof tagTypes>;
export type TagsQuery = z.infer<typeof tags>;
export type FlagCreatorsQuery = z.infer<typeof flagCreators>;
/** A search for release templates, optionally usable in one project. */
export type ReleaseTemplatesQuery = z.infer<typeof releaseTemplates>;
export type EventTypesQuery = z.infer<typeof eventTypes>;
export type EnvironmentsQuery = z.infer<typeof environments>;
