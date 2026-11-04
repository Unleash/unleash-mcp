import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { assertWithinBudget, runAgent } from './agent.ts';
import { createEvalProject, readFlags } from './unleash.ts';

const project = 'mcp-eval-kill-switch';

before(() => createEvalProject(project));

test('adds a kill switch as a flag of that type', async (t) => {
  const run = await runAgent(t, `Add a kill switch for the payments integration in the project ${project}.`);

  assertWithinBudget(run, { toolCalls: 6, toolResultTokens: 500 });
  const flags = await readFlags(project);
  assert.equal(flags.length, 1, JSON.stringify(flags));
  assert.equal(flags[0]?.type, 'kill-switch');
  assert.match(flags[0]?.name ?? '', /payment/);
});
