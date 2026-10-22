import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { inspectContextField } from './contextField.ts';
import { createRelease } from '../../release/release.ts';
import { deleteFlag } from '../../../unleash/testSetup.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./contextField.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const field = 'mcpInspectedField';
const projectField = 'mcpInspectedProjectField';
const legalValues = [{ value: 'gold', description: 'Paying customers' }, { value: 'free' }];
const flag = 'mcp-context-field-flag';
const gold = { field, operator: 'IN' as const, values: ['gold'] };

const deleteFields = async (): Promise<void> => {
  for (const contextField of [field, projectField]) await admin.DELETE('/api/admin/context/{contextField}', { params: { path: { contextField } } });
};

// The flag goes first: a field in use cannot be deleted. Two strategies on the field in one environment show as one use.
before(async () => {
  await deleteFlag(admin, project, flag);
  await deleteFields();
  await admin.POST('/api/admin/context', { body: { name: field, description: 'Customer tier', stickiness: true, legalValues } });
  await admin.POST('/api/admin/projects/{projectId}/context', { params: { path: { projectId: project } }, body: { name: projectField } });
  await createRelease(admin)({ project, flag, environment: 'development', targets: [{ name: 'Gold', constraints: [gold] }, { name: 'Gold again', constraints: [gold] }] });
});
after(async () => {
  await deleteFlag(admin, project, flag);
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

test('lists each flag environment constraining on the field when usage is included', async () => {
  const output = await inspectContextField(unleash, { kind: 'context_field', name: field, include: ['usage'] });

  assert.deepEqual(output, {
    kind: 'context_field',
    name: field,
    description: 'Customer tier',
    stickiness: true,
    legalValues,
    usedBy: [{ project, flag, environment: 'development' }],
  });
});

test('fails with the Unleash error when the usage cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: `/api/admin/context/${field}`, method: 'GET' }).reply(200, { name: field });
  stub.intercept({ path: `/api/admin/context/${field}/strategies`, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await inspectContextField(unleash, { kind: 'context_field', name: field, include: ['usage'] });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
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
