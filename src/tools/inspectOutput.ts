import { z } from 'zod';
import { failed } from './failed.ts';

const flagNaming = z.object({
  pattern: z.string().describe('JavaScript regular expression new flag names must match'),
  example: z.string().optional(),
  description: z.string().optional(),
});

const project = z.object({
  kind: z.literal('project'),
  environments: z.array(z.string()).describe('Names release accepts as environment'),
  flagNaming: flagNaming.optional().describe('Set when the project enforces a naming pattern on new flags'),
});

// The types Unleash accepts on create; its read schema loosens them to a string.
const flagType = z.enum(['release', 'experiment', 'operational', 'kill-switch', 'permission', 'sunset']);

const parent = z.object({
  flag: z.string(),
  enabled: z.literal(false).optional().describe('Set when the parent must be disabled; absent means it must be enabled'),
  variants: z.array(z.string()).optional().describe('Variants the parent must resolve to'),
});

const tag = z.object({ type: z.string(), value: z.string() });

const link = z.object({ url: z.string(), title: z.string().optional() });

// The stages as the Unleash UI names them; the API calls them initial, pre-live, live, completed and archived.
const lifecycleStage = z.enum(['define', 'develop', 'production', 'cleanup', 'archived']);

const lifecycle = z.object({
  stage: lifecycleStage,
  status: z.string().optional().describe('Detail of the stage when Unleash has one, such as kept or discarded in cleanup'),
  enteredAt: z.string().describe('ISO timestamp'),
});

const flag = z.object({
  kind: z.literal('flag'),
  name: z.string(),
  type: flagType,
  lifecycle: lifecycle.optional(),
  expectedLifetimeEndsAt: z.string().optional().describe('ISO timestamp; after it the flag counts as stale'),
  lastSeen: z.record(z.string(), z.string()).optional().describe('ISO timestamp an SDK last evaluated the flag, by environment; only environments with one'),
  createdAt: z.string().optional().describe('ISO timestamp'),
  createdBy: z.string().optional().describe('Name of the user who created the flag'),
  collaborators: z.array(z.string()).optional().describe('Names of the users who changed the flag, most recent first'),
  parent: parent.optional().describe('The flag this one depends on: it is off unless the parent resolves as required'),
  children: z.array(z.string()).optional().describe('Flags that depend on this one'),
  tags: z.array(tag).optional(),
  links: z.array(link).optional().describe('Related URLs, such as the pull request or the ticket'),
});

const result = z.discriminatedUnion('kind', [project, flag, failed]);

export const inspectOutput = {
  results: z.array(result).describe('One per query, in the order asked'),
};

export type InspectOutput = z.infer<z.ZodObject<typeof inspectOutput>>;
export type InspectResult = z.infer<typeof result>;
export type Project = z.infer<typeof project>;
export type Flag = z.infer<typeof flag>;
export type FlagType = z.infer<typeof flagType>;
export type Parent = z.infer<typeof parent>;
export type Lifecycle = z.infer<typeof lifecycle>;
export type LifecycleStage = z.infer<typeof lifecycleStage>;
export type Tag = z.infer<typeof tag>;
export type Link = z.infer<typeof link>;
