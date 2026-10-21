import { z } from 'zod';
import {
  CONSTRAINT_OPERATORS,
  type ConstraintOperator,
  type StrategyConstraint,
} from '../unleash/client.js';

const CONSTRAINTS_DOCS = 'https://docs.getunleash.io/concepts/activation-strategies#constraints';
const CONTEXT_DOCS = 'https://docs.getunleash.io/concepts/unleash-context';

export const constraintSchema = z.strictObject({
  contextName: z
    .string()
    .min(1)
    .describe('Context field to match, such as "userId" or "email", as the user said it'),
  operator: z
    .enum(CONSTRAINT_OPERATORS)
    .describe(
      'IN and NOT_IN match exact values, STR_* match text, and NUM_*, DATE_*, SEMVER_* and REGEX compare against one value',
    ),
  values: z.array(z.string().min(1)).optional().describe('Values for IN, NOT_IN and STR_*'),
  value: z
    .string()
    .min(1)
    .optional()
    .describe('The single value for NUM_*, DATE_*, SEMVER_* and REGEX'),
  inverted: z.boolean().optional().describe('Match everyone the constraint would not match'),
  caseInsensitive: z.boolean().optional().describe('Ignore case when matching text'),
});

export type ConstraintInput = z.infer<typeof constraintSchema>;

export interface ConstraintProblem {
  code: 'CONTEXT_FIELD_NOT_FOUND' | 'INVALID_CONSTRAINT';
  message: string;
  hint: string;
  options?: string[];
}

const takesSingleValue = (operator: ConstraintOperator): boolean =>
  operator === 'REGEX' || /^(NUM|DATE|SEMVER)_/.test(operator);

export function shapeConstraint(
  input: ConstraintInput,
): { constraint: StrategyConstraint } | ConstraintProblem {
  const { contextName, operator, inverted, caseInsensitive } = input;
  const invalid = (message: string): ConstraintProblem => ({
    code: 'INVALID_CONSTRAINT',
    message,
    hint: `See ${CONSTRAINTS_DOCS}.`,
  });

  if (takesSingleValue(operator)) {
    const value = input.value ?? (input.values?.length === 1 ? input.values[0] : undefined);
    if (value === undefined) {
      return invalid(
        `${operator} on "${contextName}" compares against one value; pass it as value.`,
      );
    }
    return { constraint: { contextName, operator, value, inverted, caseInsensitive } };
  }

  const values = input.values ?? (input.value !== undefined ? [input.value] : []);
  if (values.length === 0) {
    return invalid(`${operator} on "${contextName}" needs at least one entry in values.`);
  }
  return { constraint: { contextName, operator, values, inverted, caseInsensitive } };
}

/** `where` completes "is not a context field ...", such as `in project "shop"`. */
export function unknownContextField(
  contextName: string,
  available: string[],
  where: string,
  baseUrl: string,
): ConstraintProblem | undefined {
  if (available.includes(contextName)) return undefined;

  const differentCase = available.find((name) => name.toLowerCase() === contextName.toLowerCase());
  return {
    code: 'CONTEXT_FIELD_NOT_FOUND',
    message: `"${contextName}" is not a context field ${where}.`,
    hint: differentCase
      ? `Context field names are case-sensitive; did you mean "${differentCase}"?`
      : `Use one of the listed fields, or ask the user whether to create "${contextName}" with create_targeting or in Unleash (${baseUrl}/context/create). A constraint on it only matches when the app also sends "${contextName}" in its Unleash context. See ${CONTEXT_DOCS}.`,
    options: available,
  };
}
