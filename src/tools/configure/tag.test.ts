import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteTag } from './tag.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./tag.snapshot.json', import.meta.url).pathname);
const type = 'simple';
const value = 'mcp-unused-tag';

// A tag exists on its own once created, whether or not a flag has it.
before(async () => {
  await admin.DELETE('/api/admin/tags/{type}/{value}', { params: { path: { type, value } } });
  await admin.POST('/api/admin/tags', { body: { type, value } });
});
after(async () => {
  await admin.DELETE('/api/admin/tags/{type}/{value}', { params: { path: { type, value } } });
  await close();
});

test('deletes a tag', async () => {
  const outcome = await deleteTag(unleash, { kind: 'tag', action: 'delete', type, value });

  assert.deepEqual(outcome, { kind: 'applied' });
});

test('fails with the Unleash error when the tag cannot be deleted', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'No tag with type team and value payments exists';
  stub
    .intercept({ path: '/api/admin/tags/team/payments', method: 'DELETE' })
    .reply(404, unleashError('NotFoundError', message));

  const outcome = await deleteTag(unleash, { kind: 'tag', action: 'delete', type: 'team', value: 'payments' });

  assert.deepEqual(outcome, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});
