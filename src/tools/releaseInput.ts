import { z } from 'zod';

const operators = [
  'IN', 'NOT_IN', 'STR_ENDS_WITH', 'STR_STARTS_WITH', 'STR_CONTAINS',
  'NUM_EQ', 'NUM_GT', 'NUM_GTE', 'NUM_LT', 'NUM_LTE',
  'DATE_AFTER', 'DATE_BEFORE',
  'SEMVER_EQ', 'SEMVER_GT', 'SEMVER_LT', 'SEMVER_GTE', 'SEMVER_LTE',
  'REGEX', 'IN_CIDR',
] as const;

const constraint = z.object({
  field: z.string().describe('Context field name, e.g. userId, email, appName'),
  operator: z.enum(operators),
  values: z.array(z.string()).min(1),
  inverted: z.boolean().optional(),
  caseInsensitive: z.boolean().optional(),
});

const value = z.object({
  name: z.string(),
  payload: z.object({ type: z.enum(['string', 'json', 'csv', 'number']), value: z.string() }).optional(),
});

export const target = z.object({
  name: z.string().describe('What the audience is, e.g. Beta testers. Shown in the Unleash UI'),
  rollout: z.number().int().min(0).max(100).optional().describe('Percentage of the audience that gets the feature, default 100'),
  constraints: z.array(constraint).optional().describe('All must match for a user to be in the audience'),
  segments: z.array(z.string()).optional().describe('Names of audiences already defined in Unleash.'),
  value: value.optional().describe('Value the audience gets'),
});

export const releaseInput = {
  project: z.string().optional().describe('Project id. Leave out to choose from a list'),
  flag: z.string().describe('Feature flag name'),
  environment: z.string().optional().describe('Environment name. Leave out to choose from a list'),
  targets: z.array(target).min(1).describe('The audiences that get the feature, ORed. Replaces what the environment had'),
  createFlag: z.boolean().optional().describe('Set to true once the user has confirmed creating the missing flag'),
};

export type ReleaseInput = z.infer<z.ZodObject<typeof releaseInput>>;
export type Target = z.infer<typeof target>;
export type Constraint = z.infer<typeof constraint>;
