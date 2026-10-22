import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../unleash/testClient.ts';
import { unleashError } from '../unleash/testError.ts';
import { createContextField, deleteContextField } from './contextField.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./contextField.snapshot.json', import.meta.url).pathname);
const name = 'mcpContextField';
// Its own field, so the create test above does not depend on running first.
const deletable = 'mcpDeletableContextField';

const deleteFields = async (): Promise<void> => {
  for (const contextField of [name, deletable]) await admin.DELETE('/api/admin/context/{contextField}', { params: { path: { contextField } } });
};

before(deleteFields);
after(async () => {
  await deleteFields();
  await close();
});

test('creates a context field with its legal values', async () => {
  const output = await createContextField(unleash, {
    kind: 'context_field',
    action: 'create',
    name,
    description: 'Created by the MCP server tests',
    stickiness: true,
    legalValues: [{ value: 'gold', description: 'Paying customers' }, { value: 'free' }],
  });

  assert.deepEqual(output, { kind: 'created', resource: 'context_field', name });
});

test('fails with the Unleash error when the context field exists', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'A context field with that name already exist';
  stub.intercept({ path: '/api/admin/context', method: 'POST' }).reply(409, unleashError('NameExistsError', message));

  const output = await createContextField(unleash, { kind: 'context_field', action: 'create', name });

  assert.deepEqual(output, { kind: 'failed', status: 409, name: 'NameExistsError', reasons: [message] });
});

test('deletes a context field', async () => {
  await admin.POST('/api/admin/context', { body: { name: deletable } });

  const output = await deleteContextField(unleash, { kind: 'context_field', action: 'delete', name: deletable });

  assert.deepEqual(output, { kind: 'deleted', resource: 'context_field', name: deletable });
});

test('fails with the Unleash error when a flag still uses the context field', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'This context field is in use by existing flags. To delete it, first remove its usage from all flags.';
  stub.intercept({ path: `/api/admin/context/${name}`, method: 'DELETE' }).reply(409, unleashError('ConflictError', message));

  const output = await deleteContextField(unleash, { kind: 'context_field', action: 'delete', name });

  assert.deepEqual(output, { kind: 'failed', status: 409, name: 'ConflictError', reasons: [message] });
});
