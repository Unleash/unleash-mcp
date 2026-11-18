import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toStrategy, toUnleashConstraint } from './strategy.ts';
import type { Constraint } from './target.ts';

for (const [operator, value] of [
  ['NUM_EQ', '10'],
  ['NUM_GT', '10'],
  ['NUM_GTE', '10'],
  ['NUM_LT', '10'],
  ['NUM_LTE', '10'],
  ['DATE_AFTER', '2026-12-01T00:00:00Z'],
  ['DATE_BEFORE', '2026-12-01T00:00:00Z'],
  ['SEMVER_EQ', '1.2.3'],
  ['SEMVER_GT', '1.2.3'],
  ['SEMVER_GTE', '1.2.3'],
  ['SEMVER_LT', '1.2.3'],
  ['SEMVER_LTE', '1.2.3'],
] as const) {
  test(`${operator} writes a singular value on segments and strategies`, () => {
    const constraint: Constraint = { field: 'field', operator, values: [value] };
    const expected = { contextName: 'field', operator, value, inverted: false, caseInsensitive: false };

    assert.deepEqual(toUnleashConstraint(constraint), expected);
    assert.deepEqual(toStrategy('flag', { name: 'Audience', constraints: [constraint] }).constraints, [expected]);
  });
}

for (const operator of [
  'IN',
  'NOT_IN',
  'STR_ENDS_WITH',
  'STR_STARTS_WITH',
  'STR_CONTAINS',
  'REGEX',
  'IN_CIDR',
] as const) {
  test(`${operator} preserves the values array and comparison options`, () => {
    const constraint: Constraint = {
      field: 'field',
      operator,
      values: ['a', 'b'],
      inverted: true,
      caseInsensitive: true,
    };
    const expected = { contextName: 'field', operator, values: ['a', 'b'], inverted: true, caseInsensitive: true };

    assert.deepEqual(toUnleashConstraint(constraint), expected);
    assert.deepEqual(toStrategy('flag', { name: 'Audience', constraints: [constraint] }).constraints, [expected]);
  });
}
