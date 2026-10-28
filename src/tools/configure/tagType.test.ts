import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { createTagType, deleteTagType, updateTagType } from './tagType.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./tagType.snapshot.json', import.meta.url).pathname);
// Each test that needs an existing type gets its own, so tests don't depend on running in order.
const created = 'mcp-type';
const updatable = 'mcp-updatable-type';
const deletable = 'mcp-deletable-type';

const deleteTypes = async (): Promise<void> => {
  for (const name of [created, updatable, deletable])
    await admin.DELETE('/api/admin/tag-types/{name}', { params: { path: { name } } });
};

before(async () => {
  await deleteTypes();
  for (const name of [updatable, deletable])
    await admin.POST('/api/admin/tag-types', { body: { name, description: 'Before' } });
});
after(async () => {
  await deleteTypes();
  await close();
});

test('creates a tag type with its description', async () => {
  const outcome = await createTagType(unleash, {
    kind: 'tag_type',
    action: 'create',
    name: created,
    description: 'Which team owns the flag',
  });

  assert.deepEqual(outcome, { kind: 'applied' });
});

test('replaces the description of a tag type', async () => {
  const outcome = await updateTagType(unleash, {
    kind: 'tag_type',
    action: 'update',
    name: updatable,
    description: 'After',
  });

  assert.deepEqual(outcome, { kind: 'applied' });
});

test('deletes a tag type', async () => {
  const outcome = await deleteTagType(unleash, { kind: 'tag_type', action: 'delete', name: deletable });

  assert.deepEqual(outcome, { kind: 'applied' });
});

// Only an empty description matches, so leaving the field out of the request fails the test.
test('clears the description of a tag type when it is left out', async () => {
  const { unleash, stub } = createStubbedClient();
  const cleared = (body: string): boolean => isDeepStrictEqual(JSON.parse(body), { description: '' });
  stub
    .intercept({ path: '/api/admin/tag-types/team', method: 'PUT', body: cleared })
    .reply(200, { version: 1, tagType: { name: 'team', description: '' } });

  const outcome = await updateTagType(unleash, { kind: 'tag_type', action: 'update', name: 'team' });

  assert.deepEqual(outcome, { kind: 'applied' });
});

test('fails with the Unleash error when the tag type cannot be created', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'A tag type with that name already exists';
  stub.intercept({ path: '/api/admin/tag-types', method: 'POST' }).reply(409, unleashError('NameExistsError', message));

  const outcome = await createTagType(unleash, { kind: 'tag_type', action: 'create', name: 'team' });

  assert.deepEqual(outcome, { kind: 'failed', status: 409, name: 'NameExistsError', reasons: [message] });
});
