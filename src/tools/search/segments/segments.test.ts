import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { deleteSegmentNamed } from '../../../unleash/testSetup.ts';
import { searchSegments } from './segments.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./segments.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const unowned = 'mcp-searched-segment';
const owned = 'mcp-searched-project-segment';
let unownedId = 0;
let ownedId = 0;

before(async () => {
  for (const name of [unowned, owned]) await deleteSegmentNamed(admin, name);
  unownedId = (await admin.POST('/api/admin/segments', { body: { name: unowned, constraints: [] } })).data?.id ?? 0;
  ownedId = (await admin.POST('/api/admin/segments', { body: { name: owned, project, constraints: [] } })).data?.id ?? 0;
});
after(async () => {
  for (const name of [unowned, owned]) await deleteSegmentNamed(admin, name);
  await close();
});

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const creator = 'mateusz@getunleash.ai';
const created = '2026-10-22T08:00:00.000Z';

// Unleash sorts the list by name, so the project segment comes first.
test('finds segments by a part of their name, case insensitive, with what the agent filters on itself', async () => {
  const output = await searchSegments(unleash, { kind: 'segments', query: 'MCP-SEARCHED' });

  const { segments } = output as Extract<typeof output, { kind: 'segments' }>;
  for (const { createdAt } of segments) assert.match(createdAt, timestamp);
  assert.deepEqual(segments.map(({ createdAt, ...rest }) => rest), [
    { id: ownedId, name: owned, project, createdBy: creator, usedInProjects: 0, usedInFlags: 0 },
    { id: unownedId, name: unowned, createdBy: creator, usedInProjects: 0, usedInFlags: 0 },
  ]);
});

test('keeps the segments usable in a project: global or owned by it', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments', method: 'GET' }).reply(200, {
    segments: [{ id: 1, name: 'Everyone', createdAt: created }, { id: 2, name: 'Ours', project, createdAt: created }, { id: 3, name: 'Theirs', project: 'other', createdAt: created }],
  });

  const output = await searchSegments(unleash, { kind: 'segments', project });

  assert.deepEqual(output, {
    kind: 'segments',
    segments: [{ id: 1, name: 'Everyone', createdAt: created, usedInProjects: 0, usedInFlags: 0 }, { id: 2, name: 'Ours', project, createdAt: created, usedInProjects: 0, usedInFlags: 0 }],
  });
});

test('fails with the Unleash error when the segments cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments', method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchSegments(unleash, { kind: 'segments' });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
