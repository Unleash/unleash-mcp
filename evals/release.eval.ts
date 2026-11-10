import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from './agent.ts';
import { repeat } from './repeat.ts';
import { createEvalProject, evalName, readFlag } from './unleash.ts';

const project = evalName('release');
const flag = evalName('new-search');

test('rolls a new flag out to a percentage in one environment', async (t) => {
  const medians = await repeat(t, async () => {
    await createEvalProject(project);

    const run = await runAgent(t, `Turn on ${flag} for 10% of users in production, in the project ${project}.`);

    const found = await readFlag(project, flag);
    assert.deepEqual(
      found.environments?.map(({ name, enabled, strategies }) => ({
        name,
        enabled,
        rollouts: strategies?.map((strategy) => strategy.parameters?.rollout),
      })),
      [
        { name: 'development', enabled: false, rollouts: [] },
        { name: 'production', enabled: true, rollouts: ['10'] },
      ],
    );
    return run;
  });

  assert.ok(medians.toolCalls <= 6);
  assert.ok(medians.toolResultTokens <= 736);
});
