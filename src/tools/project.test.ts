import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../unleash/testClient.ts';
import { unleashError } from '../unleash/testError.ts';
import { inspectProject } from './project.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./project.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flagNaming = { pattern: '^mcp-[a-z-]+$', example: 'mcp-flag', description: 'mcp, dash, lowercase words' };

// Every flag the tests create has to match the pattern.
before(async () => {
  await admin.PUT('/api/admin/projects/{projectId}/settings', { params: { path: { projectId: project } }, body: { featureNaming: flagNaming } });
});
after(close);

test('lists the environments and the flag naming pattern of a project', async () => {
  const output = await inspectProject(unleash, { kind: 'project', project });

  assert.deepEqual(output, {
    kind: 'project',
    environments: ['development', 'production'],
    flagNaming,
  });
});

test('fails with the Unleash error when the project does not exist', async () => {
  const output = await inspectProject(unleash, { kind: 'project', project: 'unknown' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['No project found'] });
});

test('fails with the Unleash error when the project cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: `/api/admin/projects/${project}/overview`, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await inspectProject(unleash, { kind: 'project', project });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
