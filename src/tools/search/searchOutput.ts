import { z } from 'zod';
import { failed } from '../shared/failed.ts';
import { flagState } from '../shared/flagState.ts';
import { lifecycleStage } from '../shared/lifecycleStage.ts';
import { tag } from '../shared/tag.ts';

const project = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().optional().describe('ISO timestamp'),
});

const projects = z.object({
  kind: z.literal('projects'),
  projects: z.array(project),
});

const flagEnvironment = z.object({
  name: z.string(),
  state: flagState,
  lastSeenAt: z.string().optional().describe('ISO timestamp an SDK last evaluated the flag here'),
});

const flag = z.object({
  name: z.string(),
  project: z.string(),
  type: z.string(),
  stage: lifecycleStage.optional().describe('Where the flag is in its life'),
  createdAt: z.string().optional().describe('ISO timestamp'),
  createdBy: z.string().optional().describe('Name of the user who created the flag'),
  tags: z.array(tag).optional(),
  environments: z.array(flagEnvironment),
});

const flags = z.object({
  kind: z.literal('flags'),
  total: z.number().int().describe('Flags matching the query across all pages'),
  flags: z.array(flag).describe('One page, oldest first'),
});

const segment = z.object({
  id: z.number().int(),
  name: z.string(),
  project: z.string().optional().describe('Set on a project segment; absent on a global one'),
  createdAt: z.string().describe('ISO timestamp'),
  createdBy: z.string().optional().describe('Email of the user who created the segment'),
  usedInProjects: z.number().int(),
  usedInFlags: z.number().int(),
});

const segments = z.object({
  kind: z.literal('segments'),
  segments: z.array(segment).describe('Sorted by name'),
});

const contextField = z.object({
  name: z.string(),
  project: z.string().optional().describe('Set on a project field; absent on a global one'),
  description: z.string().optional(),
  stickiness: z.literal(true).optional().describe('Set when flags can use the field for custom stickiness'),
  createdAt: z.string().optional().describe('ISO timestamp'),
  usedInProjects: z.number().int(),
  usedInFlags: z.number().int(),
});

const contextFields = z.object({
  kind: z.literal('context_fields'),
  fields: z.array(contextField).describe('Sorted by name'),
});

const flagCreator = z.object({
  id: z.number().int().describe('User id'),
  name: z.string().describe('Name of the user, or the username or email when no name is set'),
});

const flagCreators = z.object({
  kind: z.literal('flag_creators'),
  total: z.number().int().describe('Creators matching the query across all pages'),
  creators: z.array(flagCreator).describe('One page, sorted by name'),
});

const tagType = z.object({
  name: z.string(),
  description: z.string().optional(),
  valueCount: z.number().int().describe('Tags of this type'),
  usedInProjects: z.number().int(),
});

const tagTypes = z.object({
  kind: z.literal('tag_types'),
  tagTypes: z.array(tagType),
});

const tags = z.object({
  kind: z.literal('tags'),
  tags: z.array(tag),
});

const releaseTemplate = z.object({
  id: z.string(),
  name: z.string(),
});

const releaseTemplates = z.object({
  kind: z.literal('release_templates'),
  templates: z.array(releaseTemplate),
});

const eventTypes = z.object({
  kind: z.literal('event_types'),
  eventTypes: z.array(z.string()),
});

const environment = z.object({
  name: z.string(),
  type: z.string().describe('Such as development or production'),
  deprecated: z.literal(true).optional().describe('Set when the environment is deprecated: its history stays'),
});

const environments = z.object({
  kind: z.literal('environments'),
  environments: z.array(environment),
});

const result = z.discriminatedUnion('kind', [projects, flags, segments, contextFields, tagTypes, tags, flagCreators, releaseTemplates, eventTypes, environments, failed]);

export const searchOutput = {
  results: z.array(result).describe('One per query, in the order asked'),
};

export type SearchOutput = z.infer<z.ZodObject<typeof searchOutput>>;
export type SearchResult = z.infer<typeof result>;
export type Projects = z.infer<typeof projects>;
export type Flags = z.infer<typeof flags>;
export type Segments = z.infer<typeof segments>;
export type ContextFields = z.infer<typeof contextFields>;
export type TagTypes = z.infer<typeof tagTypes>;
export type Tags = z.infer<typeof tags>;
export type FlagCreators = z.infer<typeof flagCreators>;
/** Release templates found, as the id and name release takes. */
export type ReleaseTemplates = z.infer<typeof releaseTemplates>;
export type EventTypes = z.infer<typeof eventTypes>;
export type Environments = z.infer<typeof environments>;
