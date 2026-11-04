import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { assertWithinBudget, runAgent } from './agent.ts';
import { createEvalProject, readFlag } from './unleash.ts';

const project = 'mcp-eval-release';
const flag = 'mcp-eval-new-search';

before(() => createEvalProject(project));

test('rolls a new flag out to a percentage in one environment', async (t) => {
  const run = await runAgent(t, `Turn on ${flag} for 10% of users in production, in the project ${project}.`);

  assertWithinBudget(run, { toolCalls: 5, toolResultTokens: 750 });
  const found = await readFlag(project, flag);
  const production = found.environments.find((e) => e.name === 'production');
  const development = found.environments.find((e) => e.name === 'development');
  assert.equal(production?.state, 'enabled');
  assert.deepEqual(
    production?.targets?.map((t) => t.rollout),
    [10],
  );
  assert.equal(development?.state, 'disabled');
  assert.equal(development?.targets, undefined);
});
