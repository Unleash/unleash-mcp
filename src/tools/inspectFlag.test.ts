import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../unleash/testClient.ts';
import { unleashError } from '../unleash/testError.ts';
import { deleteFlag } from '../unleash/testSetup.ts';
import { inspectFlag } from './inspectFlag.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./inspectFlag.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-inspected-flag';
const parent = 'mcp-inspected-parent';
const features = '/api/admin/projects/{projectId}/features';
const flagPath = `/api/admin/projects/${project}/features/${flag}`;
const tagsPath = `/api/admin/features/${flag}/tags`;

const deleteFlags = async (): Promise<void> => {
  await deleteFlag(admin, project, flag);
  await deleteFlag(admin, project, parent);
};

before(async () => {
  await deleteFlags();
  await admin.POST(features, { params: { path: { projectId: project } }, body: { name: parent } });
  await admin.POST(features, { params: { path: { projectId: project } }, body: { name: flag, type: 'kill-switch' } });
  await admin.POST('/api/admin/projects/{projectId}/features/{child}/dependencies', { params: { path: { projectId: project, child: flag } }, body: { feature: parent } });
  await admin.POST('/api/admin/features/{featureName}/tags', { params: { path: { featureName: flag } }, body: { type: 'simple', value: 'mcp-inspect' } });
  await admin.POST('/api/admin/projects/{projectId}/features/{featureName}/link', { params: { path: { projectId: project, featureName: flag } }, body: { url: 'https://example.com/mcp-inspect', title: 'Spec' } });
});
after(async () => {
  await deleteFlags();
  await close();
});

// The flag is created anew on every recording, so the timestamp is pinned to its shape, not its value.
test('describes a flag with who worked on it, its parents, tags and links', async () => {
  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  const { createdAt, ...rest } = output as Extract<typeof output, { kind: 'flag' }>;
  assert.match(createdAt ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(rest, {
    kind: 'flag',
    name: flag,
    type: 'kill-switch',
    createdBy: 'Mateusz K',
    collaborators: ['Mateusz K'],
    parent: { flag: parent },
    tags: [{ type: 'simple', value: 'mcp-inspect' }],
    links: [{ url: 'https://example.com/mcp-inspect', title: 'Spec' }],
  });
});

test('tells which variants the parent must resolve to', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release', dependencies: [{ feature: parent, enabled: true, variants: ['blue'] }] });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, { kind: 'flag', name: flag, type: 'release', parent: { flag: parent, variants: ['blue'] } });
});

test('tells when the parent must be disabled', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release', dependencies: [{ feature: parent, enabled: false, variants: [] }] });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, { kind: 'flag', name: flag, type: 'release', parent: { flag: parent, enabled: false } });
});

test('fails with the Unleash error when the flag does not exist', async () => {
  const output = await inspectFlag(unleash, { kind: 'flag', project, flag: 'mcp-unknown' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [`There's no feature named "mcp-unknown" in project "mcp-server".`] });
});

test('fails with the Unleash error when the flag cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});

test('fails with the Unleash error when the tags cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release' });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
