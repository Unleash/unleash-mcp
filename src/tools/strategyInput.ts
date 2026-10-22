import { z } from 'zod';
import type {
  FeatureStrategy,
  SegmentSummary,
  StrategyVariant,
  StrategyVariantPayload,
} from '../unleash/client.js';

const variantPayloadSchema = z.strictObject({
  type: z.enum(['json', 'csv', 'string', 'number']).describe('Payload type'),
  value: z.string().min(1).describe('Serialized payload value'),
}) satisfies z.ZodType<StrategyVariantPayload>;

export const variantSchema = z.strictObject({
  name: z.string().min(1).describe('Variant name (unique within this feature)'),
  weight: z.number().int().min(0).max(1000).describe('Variant weight (0-1000)'),
  weightType: z.enum(['variable', 'fix']).optional().describe('Variant weight type'),
  stickiness: z
    .string()
    .min(1)
    .optional()
    .describe('Stickiness to use for this variant (defaults to "default")'),
  payload: variantPayloadSchema.optional(),
});

type VariantInput = z.infer<typeof variantSchema>;

interface InputProblem {
  code: string;
  message: string;
  hint: string;
}

export const fixedWeightTotal = (variants: VariantInput[]): number | undefined =>
  variants.every((variant) => variant.weightType === 'fix')
    ? variants.reduce((total, variant) => total + variant.weight, 0)
    : undefined;

// Unleash needs one variable variant.
export const toVariants = (variants: VariantInput[]): StrategyVariant[] =>
  variants.map((variant, index) => ({
    ...variant,
    weightType:
      index === 0 && fixedWeightTotal(variants) === 1000
        ? 'variable'
        : (variant.weightType ?? 'variable'),
    stickiness: variant.stickiness ?? 'default',
  }));

const isJsonObject = (value: string): boolean => {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
};

/** The rules Unleash applies to a strategy's variants when it saves the strategy on a flag. */
export function variantProblems(variants: VariantInput[]): InputProblem[] {
  const invalid = (message: string, hint: string): InputProblem => ({
    code: 'INVALID_VARIANTS',
    message,
    hint,
  });
  const problems: InputProblem[] = [];
  const names = variants.map(({ name }) => name);
  const repeated = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  if (repeated.length > 0) {
    problems.push(
      invalid(
        `Variant names must be unique, and ${repeated.map((name) => `"${name}"`).join(', ')} appear more than once.`,
        'Give each variant its own name.',
      ),
    );
  }
  for (const { name, payload } of variants) {
    if (encodeURIComponent(name) !== name || name === '.' || name === '..' || name.length > 100) {
      problems.push(
        invalid(
          `Variant name "${name}" must be URL friendly and at most 100 characters.`,
          'Use letters, digits, "-", "_", "." or "~", with no spaces.',
        ),
      );
    }
    if (payload?.type === 'json' && !isJsonObject(payload.value)) {
      problems.push(
        invalid(
          `The payload of variant "${name}" must be a JSON object or array.`,
          'Fix the JSON, or pick another payload type.',
        ),
      );
    }
  }
  const allFixed = fixedWeightTotal(variants);
  const fixed = variants
    .filter(({ weightType }) => weightType === 'fix')
    .reduce((total, { weight }) => total + weight, 0);
  if (variants.length > 0 && allFixed !== undefined && allFixed !== 1000) {
    problems.push(
      invalid(
        `Fixed variant weights must add up to 1000 (100%) when no variant is variable; these add up to ${allFixed}.`,
        'Change the weights to add up to 1000, or leave weightType out on one variant so it takes the rest.',
      ),
    );
  } else if (fixed > 1000) {
    problems.push(
      invalid(
        `Fixed variant weights add up to ${fixed}, more than 1000 (100%).`,
        'Lower the fixed weights so the variable variants can take the rest.',
      ),
    );
  }
  return problems;
}

// false, null and a missing field all mean the same to Unleash, so they compare equal.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, field]) => field !== undefined && field !== null && field !== false)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, field]) => [key, canonical(field)]),
    );
  }
  return value;
};

type StrategyFields = Pick<
  FeatureStrategy,
  'title' | 'disabled' | 'parameters' | 'constraints' | 'segments' | 'variants'
>;

/** Whether saving `next` over `current` would change nothing. */
export function sameStrategy(current: StrategyFields, next: StrategyFields): boolean {
  const fields = (strategy: StrategyFields) =>
    JSON.stringify(
      canonical({
        title: strategy.title || undefined,
        disabled: strategy.disabled,
        parameters: strategy.parameters ?? {},
        constraints: strategy.constraints ?? [],
        segments: [...(strategy.segments ?? [])].sort((a, b) => a - b),
        variants: strategy.variants ?? [],
      }),
    );
  return fields(current) === fields(next);
}

const normalizeName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');

type SegmentLookup =
  | { status: 'found'; segment: SegmentSummary }
  | { status: 'noneUsable' }
  | { status: 'notFound'; message: string; candidates: SegmentSummary[] };

/** A segment the project can use, by exact name or else by one loose match. */
export function findSegment(
  name: string,
  segments: SegmentSummary[],
  projectId: string,
): SegmentLookup {
  const usable = segments.filter((segment) => !segment.project || segment.project === projectId);
  // Segment names are unique across the instance, so an exact match settles it.
  const exact = usable.find((segment) => segment.name === name);
  const loose = usable.filter((segment) => normalizeName(segment.name) === normalizeName(name));
  const match = exact ?? (loose.length === 1 ? loose[0] : undefined);
  if (match) return { status: 'found', segment: match };
  if (usable.length === 0) return { status: 'noneUsable' };

  const inOtherProject = segments.find(
    (segment) =>
      normalizeName(segment.name) === normalizeName(name) &&
      segment.project &&
      segment.project !== projectId,
  );
  let message = `No segment named "${name}" exists in project "${projectId}".`;
  if (loose.length > 1) message = `Several segments have a name like "${name}".`;
  else if (inOtherProject)
    message = `Segment "${inOtherProject.name}" belongs to project "${inOtherProject.project}", so this project cannot use it.`;
  return { status: 'notFound', message, candidates: loose.length > 1 ? loose : usable };
}
