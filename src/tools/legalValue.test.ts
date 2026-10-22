import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../unleash/testClient.ts';
import { unleashError } from '../unleash/testError.ts';
import { createLegalValue, deleteLegalValue } from './legalValue.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./legalValue.snapshot.json', import.meta.url).pathname);
// Not the fields in contextField.test.ts: test files run in parallel while recording.
const field = 'mcpLegalValueField';
const project = 'mcp-server';
const projectField = 'mcpProjectLegalValueField';

const deleteFields = async (): Promise<void> => {
  for (const contextField of [field, projectField]) await admin.DELETE('/api/admin/context/{contextField}', { params: { path: { contextField } } });
};

before(async () => {
  await deleteFields();
  await admin.POST('/api/admin/context', { body: { name: field } });
  await admin.POST('/api/admin/context', { body: { name: projectField, project } });
});
after(async () => {
  await deleteFields();
  await close();
});

test('adds a legal value to a context field', async () => {
  const output = await createLegalValue(unleash, { kind: 'legal_value', action: 'create', field, value: 'gold', description: 'Paying customers' });

  assert.deepEqual(output, { kind: 'applied' });
});

test('fails with the Unleash error when the context field does not exist', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = `Could not find context field with name ${field}`;
  stub.intercept({ path: `/api/admin/context/${field}/legal-values`, method: 'POST' }).reply(404, unleashError('NotFoundError', message));

  const output = await createLegalValue(unleash, { kind: 'legal_value', action: 'create', field, value: 'gold' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});

test('removes a legal value from a context field', async () => {
  await admin.POST('/api/admin/context/{contextField}/legal-values', { params: { path: { contextField: field } }, body: { value: 'silver' } });

  const output = await deleteLegalValue(unleash, { kind: 'legal_value', action: 'delete', field, value: 'silver' });

  assert.deepEqual(output, { kind: 'applied' });
});

test('fails with the Unleash error when the context field to remove a value from does not exist', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = `Could not find context field with name ${field}`;
  stub.intercept({ path: `/api/admin/context/${field}/legal-values/gold`, method: 'DELETE' }).reply(404, unleashError('NotFoundError', message));

  const output = await deleteLegalValue(unleash, { kind: 'legal_value', action: 'delete', field, value: 'gold' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});

test('adds a legal value to a context field in a project', async () => {
  const output = await createLegalValue(unleash, { kind: 'legal_value', action: 'create', project, field: projectField, value: 'gold' });

  assert.deepEqual(output, { kind: 'applied' });
});

test('removes a legal value from a context field in a project', async () => {
  await admin.POST('/api/admin/context/{contextField}/legal-values', { params: { path: { contextField: projectField } }, body: { value: 'silver' } });

  const output = await deleteLegalValue(unleash, { kind: 'legal_value', action: 'delete', project, field: projectField, value: 'silver' });

  assert.deepEqual(output, { kind: 'applied' });
});
