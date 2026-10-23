import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { searchContextFields } from './contextFields.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./contextFields.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const unowned = 'mcpSearchedField';
const owned = 'mcpSearchedProjectField';
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const deleteFields = async (): Promise<void> => {
  for (const contextField of [unowned, owned]) await admin.DELETE('/api/admin/context/{contextField}', { params: { path: { contextField } } });
};

before(async () => {
  await deleteFields();
  await admin.POST('/api/admin/context', { body: { name: unowned, description: 'Customer tier', stickiness: true } });
  await admin.POST('/api/admin/projects/{projectId}/context', { params: { path: { projectId: project } }, body: { name: owned } });
});
after(async () => {
  await deleteFields();
  await close();
});

// Unleash sorts the list by name, so the global field comes first.
test('finds context fields by a part of their name, case insensitive, with what the agent filters on itself', async () => {
  const output = await searchContextFields(unleash, { kind: 'context_fields', query: 'MCPSEARCHED' });

  assert(output.kind === 'context_fields');

  const { fields } = output;
  for (const { createdAt } of fields) assert.match(createdAt ?? '', timestamp);
  assert.deepEqual(fields.map(({ createdAt, ...rest }) => rest), [
    { name: unowned, description: 'Customer tier', stickiness: true, usedInProjects: 0, usedInFlags: 0 },
    { name: owned, project, usedInProjects: 0, usedInFlags: 0 },
  ]);
});

// Unleash does the scoping: the project list with the global fields included. Only that endpoint is stubbed,
// so asking the global list instead would fail here.
test('asks Unleash for the fields usable in a project: global or owned by it', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: `/api/admin/projects/${project}/context`, query: { include: 'root' }, method: 'GET' }).reply(200, [{ name: 'tier' }, { name: 'plan', project }]);

  const output = await searchContextFields(unleash, { kind: 'context_fields', project });

  assert.deepEqual(output, { kind: 'context_fields', fields: [{ name: 'tier', usedInProjects: 0, usedInFlags: 0 }, { name: 'plan', project, usedInProjects: 0, usedInFlags: 0 }] });
});

test('fails with the Unleash error when the context fields cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/context', query: { include: 'project' }, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchContextFields(unleash, { kind: 'context_fields' });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
