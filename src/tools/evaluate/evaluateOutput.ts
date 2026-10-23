import { z } from 'zod';
import { failed } from '../shared/failed.ts';

const query = { flag: z.string(), environment: z.string() };

const evaluated = z.object({
  kind: z.literal('evaluated'),
  ...query,
  result: z.enum(['on', 'off', 'unknown']).describe('unknown: only a target Unleash cannot evaluate on the server could have turned the feature on. SDKs may still serve it'),
});

const failedQuery = failed.extend(query);

const result = z.discriminatedUnion('kind', [evaluated, failedQuery]);

export const evaluateOutput = {
  results: z.array(result).describe('One per query, in the order asked'),
};

export type EvaluateOutput = z.infer<z.ZodObject<typeof evaluateOutput>>;
export type EvaluateResult = z.infer<typeof result>;
export type Evaluated = z.infer<typeof evaluated>;
