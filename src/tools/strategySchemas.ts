import { z } from 'zod';
import type {
  StrategyConstraint,
  StrategyVariant,
  StrategyVariantPayload,
} from '../unleash/client.js';

const variantPayloadSchema = z.object({
  type: z.enum(['json', 'csv', 'string', 'number']).describe('Payload type'),
  value: z.string().min(1).describe('Serialized payload value'),
}) satisfies z.ZodType<StrategyVariantPayload>;

export const variantSchema = z
  .object({
    name: z.string().min(1).describe('Variant name (unique within this feature)'),
    weight: z.number().int().min(0).max(1000).describe('Variant weight (0-1000)'),
    weightType: z.enum(['variable', 'fix']).optional().describe('Variant weight type'),
    stickiness: z
      .string()
      .min(1)
      .optional()
      .describe('Stickiness to use for this variant (defaults to "default")'),
    payload: variantPayloadSchema.optional(),
  })
  .describe('Strategy-level variant definition');

export const constraintSchema = z
  .object({
    contextName: z
      .string()
      .min(1)
      .describe('Context field to evaluate, e.g. "webVersion", "appName" or "userId"'),
    operator: z
      .enum([
        'IN',
        'NOT_IN',
        'STR_CONTAINS',
        'STR_STARTS_WITH',
        'STR_ENDS_WITH',
        'NUM_EQ',
        'NUM_GT',
        'NUM_GTE',
        'NUM_LT',
        'NUM_LTE',
        'DATE_AFTER',
        'DATE_BEFORE',
        'SEMVER_EQ',
        'SEMVER_GT',
        'SEMVER_GTE',
        'SEMVER_LT',
        'SEMVER_LTE',
        'REGEX',
      ])
      .describe('Comparison operator, e.g. NUM_GTE for "this value or higher"'),
    value: z
      .string()
      .min(1)
      .optional()
      .describe('Single value, used by the NUM_*, DATE_* and SEMVER_* operators'),
    values: z
      .array(z.string().min(1))
      .optional()
      .describe('Value list, used by the IN, NOT_IN and STR_* operators'),
    inverted: z.boolean().optional().describe('Negate the constraint (defaults to false)'),
    caseInsensitive: z
      .boolean()
      .optional()
      .describe('Case-insensitive string comparison (defaults to false)'),
  })
  .describe(
    'Constraint that narrows when the strategy applies, e.g. { contextName: "webVersion", operator: "NUM_GTE", value: "1.42.0" } to only enable the flag for clients that already ship the code',
  ) satisfies z.ZodType<StrategyConstraint>;

type VariantInput = z.infer<typeof variantSchema>;

/** Apply the Unleash defaults a strategy variant needs before it is sent. */
export function toStrategyVariants(variants: VariantInput[]): StrategyVariant[] {
  return variants.map((variant) => ({
    name: variant.name,
    weight: variant.weight,
    weightType: variant.weightType ?? 'variable',
    stickiness: variant.stickiness ?? 'default',
    ...(variant.payload ? { payload: variant.payload } : {}),
  }));
}
