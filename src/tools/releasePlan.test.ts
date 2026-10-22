import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Target } from './releaseInput.ts';
import { planRelease } from './releasePlan.ts';

const variantsOf = (target: Target) => planRelease('mcp-flag', [target], { enabled: true, strategyIds: [] }).adds[0]?.variants;

test('gives a value with a share a fixed part of the audience', () => {
  const variants = variantsOf({ name: 'Checkout test', values: [{ name: 'a' }, { name: 'control', share: 20 }] });

  assert.deepEqual(variants, [
    { name: 'a', weight: 0, weightType: 'variable', stickiness: 'default' },
    { name: 'control', weight: 200, weightType: 'fix', stickiness: 'default' },
  ]);
});

test('splits what the shares leave among the values without one', () => {
  const variants = variantsOf({ name: 'Checkout test', values: [{ name: 'control', share: 20 }, { name: 'a' }, { name: 'b' }] });

  assert.deepEqual(variants, [
    { name: 'control', weight: 200, weightType: 'fix', stickiness: 'default' },
    { name: 'a', weight: 0, weightType: 'variable', stickiness: 'default' },
    { name: 'b', weight: 0, weightType: 'variable', stickiness: 'default' },
  ]);
});

test('lets the last value take what is left when every value has a share', () => {
  const variants = variantsOf({ name: 'Checkout test', values: [{ name: 'control', share: 30 }, { name: 'new', share: 70 }] });

  assert.deepEqual(variants, [
    { name: 'control', weight: 300, weightType: 'fix', stickiness: 'default' },
    { name: 'new', weight: 700, weightType: 'variable', stickiness: 'default' },
  ]);
});
