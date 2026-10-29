import { z } from 'zod';
import { failed } from '../shared/failed.ts';
import { constraint } from '../shared/target.ts';

const query = { flag: z.string(), environment: z.string() };

const servedValue = z.object({
  name: z.string(),
  payload: z.object({ type: z.string(), value: z.string() }).optional(),
});

const conditions = z.object({
  segments: z
    .array(z.object({ id: z.number().int(), name: z.string() }))
    .optional()
    .describe('Their constraints, as a segment inspect shows them'),
  constraints: z.array(constraint).optional(),
  rollout: z.number().optional().describe('Percentage of the audience that gets the feature, only when under 100'),
  stickiness: z
    .string()
    .optional()
    .describe(
      'The context field the rollout groups contexts by, so the same value always lands on the same side of it. random: a new draw on every call, so the result can change. Alone in missedBy when the context lacks the field',
    ),
});

const named = { name: z.string().optional() };

const blocker = z.enum(['environment', 'parent']);

const evaluatedTarget = z.discriminatedUnion('result', [
  z.object({
    ...named,
    result: z.literal('matched'),
    matchedBy: conditions.describe(
      'All of its segments and constraints, and its rollout, which let the context in. Empty when it has none',
    ),
  }),
  z.object({
    ...named,
    result: z.literal('missed'),
    missedBy: conditions.describe(
      'Only the segments and constraints that kept the context out, or its rollout when they all let it in. Empty when something else did',
    ),
  }),
  z
    .object({
      ...named,
      result: z.literal('unknown'),
      strategy: z.string().describe('The strategy only SDKs can check, as SDKs register it'),
      matchedBy: conditions
        .omit({ rollout: true, stickiness: true })
        .describe('All of its segments and constraints, which let the context in'),
    })
    .describe('What is left only SDKs can check, such as a custom strategy'),
  z.object({ ...named, result: z.literal('disabled') }).describe('SDKs never get it'),
]);

const evaluated = z.object({
  kind: z.literal('evaluated'),
  ...query,
  result: z
    .enum(['enabled', 'disabled', 'unknown'])
    .describe(
      'unknown: only a target Unleash cannot evaluate on the server could have enabled the feature. SDKs may still serve it',
    ),
  blockedBy: z
    .array(blocker)
    .optional()
    .describe(
      'What disables the feature whatever its targets say. environment: the feature is disabled in this environment. parent: the flag it depends on, as a flag inspect shows it, does not resolve as required. Its targets show what happens once nothing blocks it',
    ),
  value: servedValue.optional().describe('What the code receives, when the flag has values'),
  targets: z
    .array(evaluatedTarget)
    .optional()
    .describe(
      "In the order Unleash checks them: the active milestone's first, then the environment's, each as inspect lists them",
    ),
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
export type Blocker = z.infer<typeof blocker>;
