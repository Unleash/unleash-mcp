import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { deleteTag } from '../../configure/tag.ts';
import { searchTags } from './tags.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./tags.snapshot.json', import.meta.url).pathname);
const type = 'simple';
const value = 'mcp-searched-tag';

before(async () => {
  await deleteTag(admin, { kind: 'tag', action: 'delete', type, value });
  await admin.POST('/api/admin/tags', { body: { type, value } });
});
after(async () => {
  await deleteTag(admin, { kind: 'tag', action: 'delete', type, value });
  await close();
});

test('finds tags by a part of their value, case insensitive', async () => {
  const output = await searchTags(unleash, { kind: 'tags', query: 'MCP-SEARCHED' });

  assert.deepEqual(output, { kind: 'tags', tags: [{ type, value }] });
});

// Replay matches the full URL, so asking the all-tags endpoint instead would fail here.
test('asks Unleash for the tags of one type', async () => {
  const output = await searchTags(unleash, { kind: 'tags', type, query: 'MCP-SEARCHED' });

  assert.deepEqual(output, { kind: 'tags', tags: [{ type, value }] });
});

test('fails with the Unleash error when the tags cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/tags', method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchTags(unleash, { kind: 'tags' });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
