import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { deleteFlag } from '../../../unleash/testSetup.ts';
import { searchFlags } from './flags.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./flags.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const first = 'mcp-searched-first';
const second = 'mcp-searched-second';
const features = '/api/admin/projects/{projectId}/features';
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const deleteFlags = async (): Promise<void> => {
  await deleteFlag(admin, project, first);
  await deleteFlag(admin, project, second);
};

before(async () => {
  await deleteFlags();
  await admin.POST(features, { params: { path: { projectId: project } }, body: { name: first, type: 'kill-switch' } });
  await admin.POST('/api/admin/features/{featureName}/tags', { params: { path: { featureName: first } }, body: { type: 'simple', value: 'mcp-search' } });
  await admin.POST(features, { params: { path: { projectId: project } }, body: { name: second } });
});
after(async () => {
  await deleteFlags();
  await close();
});

// Unleash orders by creation date, oldest first, so the first flag fills a page of one and the total still counts both.
// Unleash records the lifecycle stage shortly after a flag is created, so a recording may or may not see it: the stubbed test pins it.
test('finds a page of flags by a part of their name, with the total across pages', async () => {
  const output = await searchFlags(unleash, { kind: 'flags', project, query: 'MCP-SEARCHED', offset: 0, limit: 1 });

  const { total, flags } = output as Extract<typeof output, { kind: 'flags' }>;
  assert.equal(total, 2);
  for (const { createdAt } of flags) assert.match(createdAt ?? '', timestamp);
  assert.deepEqual(flags.map(({ createdAt, stage, ...rest }) => rest), [{
    name: first,
    project,
    type: 'kill-switch',
    createdBy: 'Mateusz K',
    tags: [{ type: 'simple', value: 'mcp-search' }],
    environments: [{ name: 'development', enabled: false }, { name: 'production', enabled: false }],
  }]);
});

test('skips the first page with the offset', async () => {
  const output = await searchFlags(unleash, { kind: 'flags', project, query: 'mcp-searched', offset: 1, limit: 1 });

  const { total, flags } = output as Extract<typeof output, { kind: 'flags' }>;
  assert.equal(total, 2);
  assert.deepEqual(flags.map(({ name }) => name), [second]);
});

// Only the request without a project filter is stubbed, so scoping it would fail here.
test('searches every project when none is given, naming the lifecycle stage as the UI does', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/search/features', query: { offset: '0', limit: '20' }, method: 'GET' }).reply(200, {
    total: 1,
    features: [{
      name: 'checkout',
      project: 'web',
      type: 'release',
      lifecycle: { stage: 'pre-live', enteredStageAt: '2026-10-21T08:00:00.000Z' },
      environments: [{ name: 'production', enabled: true, lastSeenAt: '2026-10-22T08:00:00.000Z' }],
    }],
  });

  const output = await searchFlags(unleash, { kind: 'flags', offset: 0, limit: 20 });

  assert.deepEqual(output, {
    kind: 'flags',
    total: 1,
    flags: [{ name: 'checkout', project: 'web', type: 'release', stage: 'develop', environments: [{ name: 'production', enabled: true, lastSeenAt: '2026-10-22T08:00:00.000Z' }] }],
  });
});

test('fails with the Unleash error when the flags cannot be searched', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/search/features', query: { project: 'IS:web', offset: '0', limit: '20' }, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchFlags(unleash, { kind: 'flags', project: 'web', offset: 0, limit: 20 });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
