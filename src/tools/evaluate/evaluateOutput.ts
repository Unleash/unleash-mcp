import { z } from 'zod';
import { failed } from '../shared/failed.ts';
import { constraint } from '../shared/target.ts';

const query = { flag: z.string(), environment: z.string() };

const servedValue = z.object({
  name: z.string(),
  payload: z.object({ type: z.string(), value: z.string() }).optional(),
});

const conditions = z.object({
  segments: z.array(z.object({ id: z.number().int(), name: z.string() })).optional(),
  constraints: z.array(constraint).optional(),
  rollout: z.number().optional().describe('Percentage of the audience that gets the feature, only when under 100'),
});

const named = { name: z.string().optional() };

const evaluatedTarget = z.discriminatedUnion('result', [
  z.object({ ...named, result: z.literal('matched'), matchedBy: conditions.describe('All of its segments and constraints, and its rollout, which let the context in. Empty when it has none') }),
  z.object({ ...named, result: z.literal('missed'), missedBy: conditions.describe('Only the segments and constraints that kept the context out, or its rollout when they all let it in. Empty when something else did, such as a context without the field the rollout sticks to') }),
  z.object({ ...named, result: z.literal('unknown'), matchedBy: conditions.omit({ rollout: true }).describe('All of its segments and constraints, which let the context in') })
    .describe('What is left only SDKs can check, such as a custom strategy'),
  z.object({ ...named, result: z.literal('disabled') }).describe('SDKs never get it'),
]);

const evaluated = z.object({
  kind: z.literal('evaluated'),
  ...query,
  result: z.enum(['on', 'off', 'unknown']).describe('unknown: only a target Unleash cannot evaluate on the server could have turned the feature on. SDKs may still serve it'),
  value: servedValue.optional().describe('What the code receives, when the flag has values'),
  targets: z.array(evaluatedTarget).optional().describe('In the order Unleash checks them: the active milestone\'s first, then the environment\'s, each as inspect lists them'),
});

const failedQuery = failed.extend(query);

const result = z.discriminatedUnion('kind', [evaluated, failedQuery]);

export const evaluateOutput = {
  results: z.array(result).describe('One per query, in the order asked'),
};

export type EvaluateOutput = z.infer<z.ZodObject<typeof evaluateOutput>>;
export type EvaluateResult = z.infer<typeof result>;
export type Evaluated = z.infer<typeof evaluated>;
export type ServedValue = z.infer<typeof servedValue>;
export type EvaluatedTarget = z.infer<typeof evaluatedTarget>;
export type Conditions = z.infer<typeof conditions>;
