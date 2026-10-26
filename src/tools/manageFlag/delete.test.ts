import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteFlag } from '../../unleash/testSetup.ts';
import { deleteArchivedFlag } from './delete.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./delete.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-deleted-flag';

before(async () => {
  await deleteFlag(admin, project, flag);
  await admin.POST('/api/admin/projects/{projectId}/features', { params: { path: { projectId: project } }, body: { name: flag } });
  await admin.DELETE('/api/admin/projects/{projectId}/features/{featureName}', { params: { path: { projectId: project, featureName: flag } } });
});
// Cleans up only after a failed recording: a deleted flag is gone already.
after(async () => {
  await deleteFlag(admin, project, flag);
  await close();
});

test('deletes an archived flag for good', async () => {
  const output = await deleteArchivedFlag(unleash, { action: 'delete', project, flag });

  assert.deepEqual(output, { kind: 'applied' });
});

test('fails with the Unleash error when the flag is in another project', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'The operation could not be completed. The features exist, but the provided project ids ("mobile") does not match the project provided in request URL ("web").';
  stub.intercept({ path: '/api/admin/projects/web/delete', method: 'POST' }).reply(403, unleashError('InvalidOperationError', message));

  const output = await deleteArchivedFlag(unleash, { action: 'delete', project: 'web', flag: 'checkout' });

  assert.deepEqual(output, { kind: 'failed', status: 403, name: 'InvalidOperationError', reasons: [message] });
});
