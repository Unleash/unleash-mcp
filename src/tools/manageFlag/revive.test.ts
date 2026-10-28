import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteFlag } from '../../unleash/testSetup.ts';
import { reviveFlag } from './revive.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./revive.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-revived-flag';

before(async () => {
  await deleteFlag(admin, project, flag);
  await admin.POST('/api/admin/projects/{projectId}/features', {
    params: { path: { projectId: project } },
    body: { name: flag },
  });
  await admin.DELETE('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId: project, featureName: flag } },
  });
});
after(async () => {
  await deleteFlag(admin, project, flag);
  await close();
});

test('brings an archived flag back', async () => {
  const output = await reviveFlag(unleash, { action: 'revive', project, flag });

  assert.deepEqual(output, { kind: 'applied' });
});

test('fails with the Unleash error when the flag cannot be revived', async () => {
  const { unleash, stub } = createStubbedClient();
  const message =
    'The operation could not be completed. The features exist, but the provided project ids ("mobile") does not match the project provided in request URL ("web").';
  stub
    .intercept({ path: '/api/admin/projects/web/revive', method: 'POST' })
    .reply(403, unleashError('InvalidOperationError', message));

  const output = await reviveFlag(unleash, { action: 'revive', project: 'web', flag: 'checkout' });

  assert.deepEqual(output, { kind: 'failed', status: 403, name: 'InvalidOperationError', reasons: [message] });
});
