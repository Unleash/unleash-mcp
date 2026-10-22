import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { inspectContextField } from './contextField.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./contextField.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const field = 'mcpInspectedField';
const projectField = 'mcpInspectedProjectField';
const legalValues = [{ value: 'gold', description: 'Paying customers' }, { value: 'free' }];

const deleteFields = async (): Promise<void> => {
  for (const contextField of [field, projectField]) await admin.DELETE('/api/admin/context/{contextField}', { params: { path: { contextField } } });
};

before(async () => {
  await deleteFields();
  await admin.POST('/api/admin/context', { body: { name: field, description: 'Customer tier', stickiness: true, legalValues } });
  await admin.POST('/api/admin/projects/{projectId}/context', { params: { path: { projectId: project } }, body: { name: projectField } });
});
after(async () => {
  await deleteFields();
  await close();
});

test('describes a context field with the values it allows and whether it can drive stickiness', async () => {
  const output = await inspectContextField(unleash, { kind: 'context_field', name: field });

  assert.deepEqual(output, {
    kind: 'context_field',
    name: field,
    description: 'Customer tier',
    stickiness: true,
    legalValues,
  });
});

test('names the project of a project field', async () => {
  const output = await inspectContextField(unleash, { kind: 'context_field', project, name: projectField });

  assert.deepEqual(output, { kind: 'context_field', name: projectField, project, stickiness: false });
});

test('fails with the Unleash error when the context field does not exist', async () => {
  const output = await inspectContextField(unleash, { kind: 'context_field', name: 'unknown' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['Could not find context field'] });
});

test('fails with the Unleash error when the context field cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: `/api/admin/context/${field}`, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await inspectContextField(unleash, { kind: 'context_field', name: field });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
