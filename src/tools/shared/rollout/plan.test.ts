import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Target } from '../target.ts';
import { planMilestone, planTargets, planTemplate } from './plan.ts';

const variantsOf = (target: Target) =>
  planTargets({ flag: 'mcp-flag', state: 'enabled', targets: [target], current: { state: 'enabled', strategyIds: [] } })
    .adds[0]?.variants;

test('gives a value with a share a fixed part of the audience', () => {
  const variants = variantsOf({ name: 'Checkout test', values: [{ name: 'a' }, { name: 'control', share: 20 }] });

  assert.deepEqual(variants, [
    { name: 'a', weight: 0, weightType: 'variable', stickiness: 'default' },
    { name: 'control', weight: 200, weightType: 'fix', stickiness: 'default' },
  ]);
});

test('splits what the shares leave among the values without one', () => {
  const variants = variantsOf({
    name: 'Checkout test',
    values: [{ name: 'control', share: 20 }, { name: 'a' }, { name: 'b' }],
  });

  assert.deepEqual(variants, [
    { name: 'control', weight: 200, weightType: 'fix', stickiness: 'default' },
    { name: 'a', weight: 0, weightType: 'variable', stickiness: 'default' },
    { name: 'b', weight: 0, weightType: 'variable', stickiness: 'default' },
  ]);
});

test('lets the last value take what is left when every value has a share', () => {
  const variants = variantsOf({
    name: 'Checkout test',
    values: [
      { name: 'control', share: 30 },
      { name: 'new', share: 70 },
    ],
  });

  assert.deepEqual(variants, [
    { name: 'control', weight: 300, weightType: 'fix', stickiness: 'default' },
    { name: 'new', weight: 700, weightType: 'variable', stickiness: 'default' },
  ]);
});

test('keeps users in the rollout and in their value by the stickiness of the target', () => {
  const target = { name: 'Checkout test', values: [{ name: 'control' }, { name: 'new' }], stickiness: 'companyId' };

  const [strategy] = planTargets({
    flag: 'mcp-flag',
    state: 'enabled',
    targets: [target],
    current: { state: 'enabled', strategyIds: [] },
  }).adds;

  assert.partialDeepStrictEqual(strategy, {
    parameters: { stickiness: 'companyId' },
    variants: [{ stickiness: 'companyId' }, { stickiness: 'companyId' }],
  });
});

const everyone = [{ name: 'Everyone' }];

test('turns off an environment that is on', () => {
  const plan = planTargets({
    flag: 'mcp-flag',
    state: 'disabled',
    targets: everyone,
    current: { state: 'enabled', strategyIds: ['s1'] },
  });

  assert.equal(plan.state, 'disabled');
});

test('turns on an environment that is off', () => {
  const plan = planTargets({
    flag: 'mcp-flag',
    state: 'enabled',
    targets: everyone,
    current: { state: 'disabled', strategyIds: ['s1'] },
  });

  assert.equal(plan.state, 'enabled');
});

test('leaves an environment that is already off as it is', () => {
  const plan = planTargets({
    flag: 'mcp-flag',
    state: 'disabled',
    targets: everyone,
    current: { state: 'disabled', strategyIds: ['s1'] },
  });

  assert.equal(plan.state, undefined);
});

test('removes every audience of the environment when a template replaces them', () => {
  const plan = planTemplate({
    template: '01JB9GGTGQYEQ9D40R17T3YVW2',
    state: 'enabled',
    current: { state: 'enabled', strategyIds: ['s1', 's2'] },
  });

  assert.deepEqual(plan, { updates: [], adds: [], deletes: ['s1', 's2'], template: '01JB9GGTGQYEQ9D40R17T3YVW2' });
});

test('removes every audience of the environment when a milestone replaces them', () => {
  const milestone = { planId: '01JB9GGTGQYEQ9D40R17T3YVW3', milestoneId: 'm2' };

  const plan = planMilestone({ milestone, state: 'enabled', current: { state: 'disabled', strategyIds: ['s1'] } });

  assert.deepEqual(plan, { updates: [], adds: [], deletes: ['s1'], milestone, state: 'enabled' });
});
