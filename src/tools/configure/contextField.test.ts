import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { createContextField, deleteContextField, updateContextField } from './contextField.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./contextField.snapshot.json', import.meta.url).pathname);
const name = 'mcpContextField';
// Each test that needs an existing field gets its own, so tests don't depend on running in order.
const updatable = 'mcpUpdatableContextField';
const deletable = 'mcpDeletableContextField';
const project = 'mcp-server';
const projectField = 'mcpProjectContextField';
const updatableProjectField = 'mcpUpdatableProjectContextField';
const deletableProjectField = 'mcpDeletableProjectContextField';

const deleteFields = async (): Promise<void> => {
  for (const contextField of [name, updatable, deletable, projectField, updatableProjectField, deletableProjectField]) await admin.DELETE('/api/admin/context/{contextField}', { params: { path: { contextField } } });
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

  assert.deepEqual(output, { kind: 'applied' });
});

test('fails with the Unleash error when the context field exists', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'A context field with that name already exist';
  stub.intercept({ path: '/api/admin/context', method: 'POST' }).reply(409, unleashError('NameExistsError', message));

  const output = await createContextField(unleash, { kind: 'context_field', action: 'create', name });

  assert.deepEqual(output, { kind: 'failed', status: 409, name: 'NameExistsError', reasons: [message] });
});

test('replaces a context field', async () => {
  await admin.POST('/api/admin/context', { body: { name: updatable, stickiness: true, legalValues: [{ value: 'gold' }] } });

  const output = await updateContextField(unleash, {
    kind: 'context_field',
    action: 'update',
    name: updatable,
    description: 'Updated by the MCP server tests',
    legalValues: [{ value: 'silver' }],
  });

  assert.deepEqual(output, { kind: 'applied' });
});

test('fails with the Unleash error when the context field to update does not exist', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = `Could not find context field with name ${name}`;
  stub.intercept({ path: `/api/admin/context/${name}`, method: 'PUT' }).reply(404, unleashError('NotFoundError', message));

  const output = await updateContextField(unleash, { kind: 'context_field', action: 'update', name });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});

test('deletes a context field', async () => {
  await admin.POST('/api/admin/context', { body: { name: deletable } });

  const output = await deleteContextField(unleash, { kind: 'context_field', action: 'delete', name: deletable });

  assert.deepEqual(output, { kind: 'applied' });
});

test('fails with the Unleash error when a flag still uses the context field', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'This context field is in use by existing flags. To delete it, first remove its usage from all flags.';
  stub.intercept({ path: `/api/admin/context/${name}`, method: 'DELETE' }).reply(409, unleashError('ConflictError', message));

  const output = await deleteContextField(unleash, { kind: 'context_field', action: 'delete', name });

  assert.deepEqual(output, { kind: 'failed', status: 409, name: 'ConflictError', reasons: [message] });
});

test('creates a context field in a project', async () => {
  const output = await createContextField(unleash, { kind: 'context_field', action: 'create', project, name: projectField });

  assert.deepEqual(output, { kind: 'applied' });
});

test('replaces a context field in a project', async () => {
  await admin.POST('/api/admin/context', { body: { name: updatableProjectField, project } });

  const output = await updateContextField(unleash, { kind: 'context_field', action: 'update', project, name: updatableProjectField, stickiness: true });

  assert.deepEqual(output, { kind: 'applied' });
});

test('deletes a context field in a project', async () => {
  await admin.POST('/api/admin/context', { body: { name: deletableProjectField, project } });

  const output = await deleteContextField(unleash, { kind: 'context_field', action: 'delete', project, name: deletableProjectField });

  assert.deepEqual(output, { kind: 'applied' });
});
