import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from './agent.ts';
import { repeat } from './repeat.ts';
import { createEvalProject, evalName, readFlags } from './unleash.ts';

const project = evalName('kill-switch');
const flag = evalName('disable-payments');

test('adds a kill switch as a flag of that type', async (t) => {
  const medians = await repeat(t, async () => {
    await createEvalProject(project);

    const run = await runAgent(t, `Add a kill switch ${flag} for the payments integration, in the project ${project}.`);

    const flags = await readFlags(project);
    assert.deepEqual(
      flags.map(({ name, type }) => ({ name, type })),
      [{ name: flag, type: 'kill-switch' }],
    );
    return run;
  });

  assert.ok(medians.toolCalls <= 7);
  assert.ok(medians.toolResultTokens <= 792);
});
