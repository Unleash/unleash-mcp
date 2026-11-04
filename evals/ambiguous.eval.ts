import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createRelease } from '../src/tools/release/release.ts';
import { released } from '../src/unleash/testSetup.ts';
import { assertWithinBudget, runAgent } from './agent.ts';
import { admin, createEvalProject, readFlag } from './unleash.ts';

const project = 'mcp-eval-ambiguous';
const flags = ['mcp-eval-checkout', 'mcp-eval-dark-mode'];

before(async () => {
  await createEvalProject(project);
  const release = createRelease(admin);
  for (const name of flags)
    released(
      await release({
        project,
        flag: { name, state: 'disabled' },
        environment: 'production',
        audience: { targets: [{ name: 'Everyone' }] },
      }),
    );
});

test('asks which feature instead of guessing when none is named', async (t) => {
  const run = await runAgent(t, `Enable the feature in production, in the project ${project}.`);

  assertWithinBudget(run, { toolCalls: 3, toolResultTokens: 750 });
  for (const name of flags) {
    const found = await readFlag(project, name);
    assert.equal(found.environments.find((e) => e.name === 'production')?.state, 'disabled', name);
  }
});
