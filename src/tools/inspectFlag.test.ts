import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../unleash/testClient.ts';
import { unleashError } from '../unleash/testError.ts';
import { inspectFlag } from './inspectFlag.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./inspectFlag.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-inspected-flag';

const deleteFlag = async (): Promise<void> => {
  await admin.DELETE('/api/admin/projects/{projectId}/features/{featureName}', { params: { path: { projectId: project, featureName: flag } } });
  await admin.DELETE('/api/admin/archive/{featureName}', { params: { path: { featureName: flag } } });
};

before(async () => {
  await deleteFlag();
  await admin.POST('/api/admin/projects/{projectId}/features', { params: { path: { projectId: project } }, body: { name: flag, type: 'kill-switch' } });
});
after(async () => {
  await deleteFlag();
  await close();
});

// The flag is created anew on every recording, so the timestamp is pinned to its shape, not its value.
test('tells what a flag is and who made it', async () => {
  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  const { createdAt, ...rest } = output as Extract<typeof output, { kind: 'flag' }>;
  assert.match(createdAt ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(rest, { kind: 'flag', name: flag, type: 'kill-switch', createdBy: 'Mateusz K' });
});

test('fails with the Unleash error when the flag does not exist', async () => {
  const output = await inspectFlag(unleash, { kind: 'flag', project, flag: 'mcp-unknown' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [`There's no feature named "mcp-unknown" in project "mcp-server".`] });
});

test('fails with the Unleash error when the flag cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: `/api/admin/projects/${project}/features/${flag}`, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
