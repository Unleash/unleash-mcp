import { z } from 'zod';

const operators = [
  'IN', 'NOT_IN', 'STR_ENDS_WITH', 'STR_STARTS_WITH', 'STR_CONTAINS',
  'NUM_EQ', 'NUM_GT', 'NUM_GTE', 'NUM_LT', 'NUM_LTE',
  'DATE_AFTER', 'DATE_BEFORE',
  'SEMVER_EQ', 'SEMVER_GT', 'SEMVER_LT', 'SEMVER_GTE', 'SEMVER_LTE',
  'REGEX', 'IN_CIDR',
] as const;

export const constraint = z.object({
  field: z.string().describe('Context field name, e.g. userId, email, appName'),
  operator: z.enum(operators).describe('How the field is compared with the values'),
  values: z.array(z.string()).min(1).describe('Matches when the field matches any of them'),
  inverted: z.boolean().optional().describe('Matches when the comparison does not'),
  caseInsensitive: z.boolean().optional().describe('Ignores case in string comparisons'),
});

const value = z.object({
  name: z.string().describe('What the code receives to tell values apart, e.g. blue-button'),
  payload: z.object({
    type: z.enum(['string', 'json', 'csv', 'number']).describe('How the code should parse the value'),
    value: z.string().describe('e.g. {"color":"blue"}'),
  }).optional().describe('Data the code receives with the value'),
  share: z.number().int().min(0).max(100).optional().describe('Percentage of the audience that gets this value. Values without one split what is left evenly'),
});

// The plan turns the last of a fully shared list into the one taking what is left (see releasePlan.ts),
// which only keeps its share when the shares add up to 100. Shares over 100 are left to Unleash to reject.
const values = z.array(value).min(1).refine(
  (vs) => vs.some((v) => v.share === undefined) || vs.reduce((sum, v) => sum + (v.share ?? 0), 0) === 100,
  'When every value has a share, the shares must add up to 100',
);

export const target = z.object({
  name: z.string().describe('What the audience is, e.g. Beta testers. Shown in the Unleash UI'),
  rollout: z.number().int().min(0).max(100).optional().describe('Percentage of the audience that gets the feature, default 100'),
  constraints: z.array(constraint).optional().describe('All must match for a user to be in the audience'),
  segments: z.array(z.number().int()).optional().describe('Ids of audiences already defined in Unleash'),
  values: values.optional().describe('Values the audience gets, split by share'),
});

export type Target = z.infer<typeof target>;
export type Constraint = z.infer<typeof constraint>;
export type Value = z.infer<typeof value>;
