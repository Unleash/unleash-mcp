import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { deleteFlag, deleteSegmentNamed } from '../../../unleash/testSetup.ts';
import { createRelease } from '../../release/release.ts';
import { searchFlags } from './flags.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./flags.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const first = 'mcp-searched-first';
const second = 'mcp-searched-second';
const archived = 'mcp-searched-archived';
const segment = 'mcp-searched-segment';
const features = '/api/admin/projects/{projectId}/features';
let segmentId = 0;

const deleteFlags = async (): Promise<void> => {
  await deleteFlag(admin, project, first);
  await deleteFlag(admin, project, second);
  await deleteFlag(admin, project, archived);
};

before(async () => {
  await deleteFlags();
  await admin.POST(features, { params: { path: { projectId: project } }, body: { name: first, type: 'kill-switch' } });
  await admin.POST('/api/admin/features/{featureName}/tags', { params: { path: { featureName: first } }, body: { type: 'simple', value: 'mcp-search' } });
  await admin.POST(features, { params: { path: { projectId: project } }, body: { name: second } });
  await admin.POST(features, { params: { path: { projectId: project } }, body: { name: archived } });
  await deleteSegmentNamed(admin, segment);
  const created = await admin.POST('/api/admin/segments', { body: { name: segment, constraints: [] } });
  segmentId = created.data?.id ?? 0;
  await createRelease(admin)({ project, flag: { name: second, state: 'on' }, environment: 'development', targets: [{ name: 'Beta', segments: [segmentId] }] });
  await admin.DELETE('/api/admin/projects/{projectId}/features/{featureName}', { params: { path: { projectId: project, featureName: archived } } });
});
// The flags go first: Unleash may refuse to delete a segment in use.
after(async () => {
  await deleteFlags();
  await deleteSegmentNamed(admin, segment);
  await close();
});

// Unleash leaves archived flags out unless the lifecycle filter asks for them, so the total counts the two active ones.
// Unleash orders by creation date, oldest first, so the first flag fills a page of one.
// Unleash records the lifecycle stage shortly after a flag is created, so a recording may or may not see it: the stubbed test pins it.
test('finds a page of flags by a part of their name, with the total across pages', async () => {
  const output = await searchFlags(unleash, { kind: 'flags', project, query: 'MCP-SEARCHED', offset: 0, limit: 1 });

  assert.partialDeepStrictEqual(output, {
    kind: 'flags',
    total: 2,
    flags: [{
      name: first,
      project,
      type: 'kill-switch',
      createdBy: 'Mateusz K',
      tags: [{ type: 'simple', value: 'mcp-search' }],
      environments: [{ name: 'development', enabled: false }, { name: 'production', enabled: false }],
    }],
  });
});

test('skips the first page with the offset', async () => {
  const output = await searchFlags(unleash, { kind: 'flags', project, query: 'mcp-searched', offset: 1, limit: 1 });

  assert.partialDeepStrictEqual(output, { kind: 'flags', total: 2, flags: [{ name: second }] });
});

test('maps a row, naming the lifecycle stage as the UI does', async () => {
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

test('keeps only flags in the given lifecycle stages, archived ones included when asked', async () => {
  const output = await searchFlags(unleash, { kind: 'flags', project, query: 'mcp-searched', stages: ['archived'], offset: 0, limit: 20 });

  assert.partialDeepStrictEqual(output, { kind: 'flags', total: 1, flags: [{ name: archived }] });
});

test('keeps only flags with a target on any of the given segments', async () => {
  const output = await searchFlags(unleash, { kind: 'flags', project, query: 'mcp-searched', segments: { match: 'any', of: [segment] }, offset: 0, limit: 20 });
  assert.partialDeepStrictEqual(output, { kind: 'flags', total: 1, flags: [{ name: second }] });
});

test('keeps only flags carrying all of the given tags', async () => {
  const output = await searchFlags(unleash, { kind: 'flags', project, query: 'mcp-searched', tags: { match: 'all', of: [{ type: 'simple', value: 'mcp-search' }] }, offset: 0, limit: 20 });

  assert.partialDeepStrictEqual(output, { kind: 'flags', total: 1, flags: [{ name: first }] });
});

// The flags are created while recording, so a day well before the recording keeps them all and the archived one out.
test('keeps only flags created on or after a day', async () => {
  const output = await searchFlags(unleash, { kind: 'flags', project, query: 'mcp-searched', createdAt: { match: 'onOrAfter', date: '2026-10-01' }, offset: 0, limit: 20 });

  assert.partialDeepStrictEqual(output, { kind: 'flags', total: 2, flags: [{ name: first }, { name: second }] });
});

// One stub for the whole request: a new filter adds a key here, next to how Unleash spells it.
// The recorded tests replay by full request, so they pin the any and all spellings; the exclusions are spelled here.
test('sends every filter as Unleash spells it', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({
    path: '/api/admin/search/features',
    query: {
      project: 'IS:web',
      query: 'checkout',
      lifecycle: 'IS_ANY_OF:initial,pre-live,live,completed,archived',
      segment: 'EXCLUDE_IF_ANY_OF:Beta users,Staff',
      tag: 'EXCLUDE_ALL:simple:beta,team:payments',
      createdAt: 'IS_BEFORE:2026-10-05',
      offset: '0',
      limit: '20',
    },
    method: 'GET',
  }).reply(200, { total: 0, features: [] });

  const output = await searchFlags(unleash, {
    kind: 'flags',
    project: 'web',
    query: 'checkout',
    stages: ['define', 'develop', 'production', 'cleanup', 'archived'],
    segments: { match: 'none', of: ['Beta users', 'Staff'] },
    tags: { match: 'notAll', of: [{ type: 'simple', value: 'beta' }, { type: 'team', value: 'payments' }] },
    createdAt: { match: 'before', date: '2026-10-05' },
    offset: 0,
    limit: 20,
  });

  assert.deepEqual(output, { kind: 'flags', total: 0, flags: [] });
});

test('fails with the Unleash error when the flags cannot be searched', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/search/features', query: { project: 'IS:web', offset: '0', limit: '20' }, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchFlags(unleash, { kind: 'flags', project: 'web', offset: 0, limit: 20 });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
