import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteFlag } from '../../unleash/testSetup.ts';
import { createAudit } from './audit.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./audit.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-audited-flag';

before(async () => {
  await deleteFlag(admin, project, flag);
  await admin.POST('/api/admin/projects/{projectId}/features', { params: { path: { projectId: project } }, body: { name: flag } });
  await admin.POST('/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on', { params: { path: { projectId: project, featureName: flag, environment: 'development' } } });
});
after(async () => {
  await deleteFlag(admin, project, flag);
  await close();
});

// A deleted flag keeps its history, so earlier recordings add older changes: only the latest page is asserted.
// Turning an environment on with no targets adds Unleash's default one first.
test('lists the changes to a flag, most recent first, with who made them and where', async () => {
  const output = await createAudit(unleash)({ flag, offset: 0, limit: 2 });

  assert(output.kind === 'changes');
  assert.partialDeepStrictEqual(output.changes, [
    { type: 'feature-environment-enabled', changedBy: 'mateusz@getunleash.ai', project, flag, environment: 'development' },
    { type: 'feature-strategy-add', changedBy: 'mateusz@getunleash.ai', project, flag, environment: 'development' },
  ]);
  // Turning the environment on and adding its default target were one request, so one group.
  assert(output.changes[0]?.groupId);
  assert.equal(output.changes[0].groupId, output.changes[1]?.groupId);
});

test('fails with the Unleash error when the changes cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: (path) => path.startsWith('/api/admin/search/events'), method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await createAudit(unleash)({ flag, offset: 0, limit: 20 });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
