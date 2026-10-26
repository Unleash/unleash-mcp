import type { components } from '../../unleash/api.d.ts';
import type { Constraint } from './target.ts';

export type UnleashConstraint = components['schemas']['constraintSchema'];

// A constraint as release takes it, from the shape Unleash stores on strategies and segments.
export const toConstraint = (c: UnleashConstraint): Constraint => ({
  field: c.contextName,
  operator: c.operator,
  // Single-value operators (numbers, dates, semver) keep their value in `value`.
  values: c.values?.length ? c.values : c.value ? [c.value] : [],
  ...(c.inverted ? { inverted: true } : {}),
  ...(c.caseInsensitive ? { caseInsensitive: true } : {}),
});
