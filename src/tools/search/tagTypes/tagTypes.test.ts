import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { deleteTagType } from '../../configure/tagType.ts';
import { searchTagTypes } from './tagTypes.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./tagTypes.snapshot.json', import.meta.url).pathname);
const name = 'mcp-searched-type';

before(async () => {
  await deleteTagType(admin, { kind: 'tag_type', action: 'delete', name });
  await admin.POST('/api/admin/tag-types', { body: { name, description: 'Created by the MCP server tests', icon: null, color: null } });
});
after(async () => {
  await deleteTagType(admin, { kind: 'tag_type', action: 'delete', name });
  await close();
});

test('finds tag types by a part of their name, case insensitive', async () => {
  const output = await searchTagTypes(unleash, { kind: 'tag_types', query: 'MCP-SEARCHED' });

  assert.deepEqual(output, { kind: 'tag_types', tagTypes: [{ name, description: 'Created by the MCP server tests', valueCount: 0, usedInProjects: 0 }] });
});

test('fails with the Unleash error when the tag types cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/tag-types', method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchTagTypes(unleash, { kind: 'tag_types' });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
