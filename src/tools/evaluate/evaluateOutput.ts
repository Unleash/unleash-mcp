import { z } from 'zod';
import { failed } from '../shared/failed.ts';

const query = { flag: z.string(), environment: z.string() };

const servedValue = z.object({
  name: z.string(),
  payload: z.object({ type: z.string(), value: z.string() }).optional(),
});

const evaluatedTarget = z.object({
  name: z.string().optional(),
  result: z.enum(['matched', 'missed', 'unknown', 'disabled']).describe('unknown: Unleash cannot evaluate it on the server. disabled: SDKs never get it'),
});

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
