import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from './agent.ts';
import { repeat } from './repeat.ts';
import { createEvalProject, readFlags } from './unleash.ts';

const project = 'mcp-eval-kill-switch';

test('adds a kill switch as a flag of that type', async (t) => {
  const medians = await repeat(t, async () => {
    await createEvalProject(project);

    const run = await runAgent(t, `Add a kill switch for the payments integration in the project ${project}.`);

    const flags = await readFlags(project);
    assert.deepEqual(
      flags.map(({ type }) => type),
      ['kill-switch'],
    );
    assert.match(flags[0].name, /payment/i);
    return run;
  });

  assert.ok(medians.toolCalls <= 7);
  assert.ok(medians.toolResultTokens <= 792);
});
