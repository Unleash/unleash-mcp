import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../unleash/testClient.ts';
import { unleashError } from '../unleash/testError.ts';
import { createContextField } from './contextField.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./contextField.snapshot.json', import.meta.url).pathname);
const name = 'mcpContextField';

const deleteField = async (): Promise<void> => {
  await admin.DELETE('/api/admin/context/{contextField}', { params: { path: { contextField: name } } });
};

before(deleteField);
after(async () => {
  await deleteField();
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
