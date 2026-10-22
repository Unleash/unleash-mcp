import { z } from 'zod';
import { constraint, target } from '../shared/target.ts';
import { failed } from '../shared/failed.ts';
import { legalValue } from '../shared/legalValue.ts';

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

const targets = z.array(target.required({ rollout: true }));

const transition = z.discriminatedUnion('type', [
  z.object({ type: z.literal('time'), intervalMinutes: z.number() }),
  z.object({ type: z.literal('exposure'), minimumExposures: z.number().describe('Evaluations of the flag') }),
]);

const milestone = z.object({
  name: z.string(),
  active: z.literal(true).optional().describe('Set on the milestone the plan is at'),
  transition: transition.optional().describe('Set when the plan moves on from this milestone by itself, once the condition is met'),
  targets: targets.optional().describe('The audiences this milestone gives the feature to'),
});

const releasePlan = z.object({
  name: z.string(),
  milestones: z.array(milestone).describe('In order; the plan moves from one to the next'),
});

const environment = z.object({
  name: z.string(),
  enabled: z.boolean(),
  lastSeenAt: z.string().optional().describe('ISO timestamp an SDK last evaluated the flag here'),
  targets: targets.optional().describe('The audiences that get the feature, in the shape release takes'),
  releasePlan: releasePlan.optional().describe('Set when the environment is rolled out through a release plan'),
});

const flag = z.object({
  kind: z.literal('flag'),
  name: z.string(),
  type: flagType,
  lifecycle: lifecycle.optional().describe('Where the flag is in its life'),
  expectedLifetimeEndsAt: z.string().optional().describe('ISO timestamp; after it the flag counts as stale'),
  environments: z.array(environment),
  createdAt: z.string().optional().describe('ISO timestamp'),
  createdBy: z.string().optional().describe('Name of the user who created the flag'),
  collaborators: z.array(z.string()).optional().describe('Names of the users who changed the flag, most recent first'),
  parent: parent.optional().describe('The flag this one depends on: it is off unless the parent resolves as required'),
  children: z.array(z.string()).optional().describe('Flags that depend on this one'),
  tags: z.array(tag).optional(),
  links: z.array(link).optional().describe('Related URLs, such as the pull request or the ticket'),
});

const usage = z.object({ project: z.string(), flag: z.string(), environment: z.string() });

const contextField = z.object({
  kind: z.literal('context_field'),
  name: z.string(),
  project: z.string().optional().describe('Set on a project field; absent on a global one'),
  description: z.string().optional(),
  stickiness: z.boolean().describe('Whether flags can use the field for custom stickiness'),
  legalValues: z.array(legalValue).optional().describe('Set when constraints on the field may only use these values'),
  usedBy: z.array(usage).optional().describe('Set when usage is included; every flag environment with a constraint on the field'),
});

const segment = z.object({
  kind: z.literal('segment'),
  id: z.number().int(),
  name: z.string(),
  project: z.string().optional().describe('Set on a project segment; absent on a global one'),
  description: z.string().optional(),
  constraints: z.array(constraint).describe('All must match for a user to be in the segment'),
  createdAt: z.string().optional().describe('ISO timestamp'),
  createdBy: z.string().optional().describe('Email of the user who created the segment'),
  usedBy: z.array(usage).optional().describe('Set when usage is included; every flag environment with a target on the segment'),
});

const result = z.discriminatedUnion('kind', [project, flag, contextField, segment, failed]);

export const inspectOutput = {
  results: z.array(result).describe('One per query, in the order asked'),
};

export type InspectOutput = z.infer<z.ZodObject<typeof inspectOutput>>;
export type InspectResult = z.infer<typeof result>;
export type Project = z.infer<typeof project>;
export type Flag = z.infer<typeof flag>;
export type ContextField = z.infer<typeof contextField>;
export type Usage = z.infer<typeof usage>;
export type Segment = z.infer<typeof segment>;
export type FlagType = z.infer<typeof flagType>;
export type Parent = z.infer<typeof parent>;
export type Lifecycle = z.infer<typeof lifecycle>;
export type Environment = z.infer<typeof environment>;
export type ReleasePlan = z.infer<typeof releasePlan>;
export type Milestone = z.infer<typeof milestone>;
export type Transition = z.infer<typeof transition>;
export type LifecycleStage = z.infer<typeof lifecycleStage>;
export type Tag = z.infer<typeof tag>;
export type Link = z.infer<typeof link>;
