import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFlag } from '../src/unleash/testSetup.ts';
import { runAgent } from './agent.ts';
import { repeat } from './repeat.ts';
import { admin, createEvalProject, evalName, readFlags } from './unleash.ts';

const project = evalName('ambiguous');
const flags = [evalName('checkout'), evalName('dark-mode')];

test('asks which flag is meant instead of guessing, when the prompt names none', async (t) => {
  const medians = await repeat(t, async () => {
    await createEvalProject(project);
    for (const flag of flags) await createFlag(admin, project, { flag });

    const run = await runAgent(t, `Enable the feature in production, in the project ${project}.`);

    const found = await readFlags(project);
    const off = { enabled: false, hasStrategies: false };
    assert.deepEqual(
      found.map(({ name, environments }) => ({
        name,
        environments: environments.map(({ enabled, hasStrategies }) => ({ enabled, hasStrategies })),
      })),
      flags.map((name) => ({ name, environments: [off, off] })),
    );
    // The answer is the only place a headless agent can ask, and naming both flags shows it looked first.
    for (const flag of flags) assert.ok(run.answer.includes(flag), `answer does not name ${flag}: ${run.answer}`);
    return run;
  });

  assert.ok(medians.toolCalls <= 3);
  assert.ok(medians.toolResultTokens <= 761);
});
