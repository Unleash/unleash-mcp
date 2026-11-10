import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from './agent.ts';
import { repeat } from './repeat.ts';

test('names the environments of a project', async (t) => {
  await repeat(t, async () => {
    const run = await runAgent(t, 'Which environments does the default project have? Answer with their names only.');

    assert.match(run.answer, /development/i);
    assert.match(run.answer, /production/i);
  });
});
