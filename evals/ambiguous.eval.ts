import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFlag } from '../src/unleash/testSetup.ts';
import { runAgent } from './agent.ts';
import { repeat } from './repeat.ts';
import { admin, createEvalProject, readFlags } from './unleash.ts';

const project = 'mcp-eval-ambiguous';
const flags = ['mcp-eval-checkout', 'mcp-eval-dark-mode'];

test('asks which flag is meant instead of guessing, when the prompt names none', async (t) => {
  const medians = await repeat(t, async () => {
    await createEvalProject(project);
    for (const flag of flags) await createFlag(admin, project, { flag });

    const run = await runAgent(t, `Enable the feature in production, in the project ${project}.`);

    // The listing comes back in no fixed order.
    const found = (await readFlags(project)).toSorted((a, b) => a.name.localeCompare(b.name));
    const untouched = [
      { name: 'development', enabled: false, hasStrategies: false },
      { name: 'production', enabled: false, hasStrategies: false },
    ];
    assert.deepEqual(
      found.map(({ name: flag, environments }) => ({
        name: flag,
        environments: environments.map(({ name, enabled, hasStrategies }) => ({ name, enabled, hasStrategies })),
      })),
      flags.map((name) => ({ name, environments: untouched })),
    );
    // Headless, the agent's only way to ask is its final answer. Naming both flags shows it looked before asking.
    for (const flag of flags) assert.ok(run.answer.includes(flag), `answer does not name ${flag}: ${run.answer}`);
    return run;
  });

  assert.ok(medians.toolCalls <= 3);
  assert.ok(medians.toolResultTokens <= 761);
});
