import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertWithinBudget, runAgent } from './agent.ts';

test('names the environments of a project', async (t) => {
  const run = await runAgent(t, 'Which environments does the default project have? Answer with their names only.');

  assertWithinBudget(run, { toolCalls: 2, toolResultTokens: 250 });
  assert.match(run.answer, /development/);
  assert.match(run.answer, /production/);
});
