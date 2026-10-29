import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { inspectProject } from './project.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./project.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flagNaming = { pattern: '^mcp-[a-z-]+$', example: 'mcp-flag', description: 'mcp, dash, lowercase words' };

// Every flag the tests create has to match the pattern.
before(async () => {
  await admin.PUT('/api/admin/projects/{projectId}/settings', {
    params: { path: { projectId: project } },
    body: { featureNaming: flagNaming },
  });
});
after(close);

test('shows the settings, environments and flag naming pattern of a project', async () => {
  const output = await inspectProject(unleash, { kind: 'project', project });

  assert.deepEqual(output, {
    kind: 'project',
    name: 'mcp-server',
    mode: 'open',
    environments: ['development', 'production'],
    defaultStickiness: 'default',
    flagNaming,
  });
});

// The sandbox project has no description, and the recorded test shows an empty one is left out.
test('shows the description of a project that has one', async () => {
  const { unleash, stub } = createStubbedClient();
  const description = 'Flags of the MCP server tests';
  stub
    .intercept({ path: `/api/admin/projects/${project}/overview`, method: 'GET' })
    .reply(200, { name: project, description, mode: 'private' }, { headers: { 'content-type': 'application/json' } });

  const output = await inspectProject(unleash, { kind: 'project', project });

  assert.ok(output.kind === 'project');
  assert.equal(output.description, description);
});

test('fails with the Unleash error when the project does not exist', async () => {
  const output = await inspectProject(unleash, { kind: 'project', project: 'unknown' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['No project found'] });
});

test('fails with the Unleash error when the project cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: `/api/admin/projects/${project}/overview`, method: 'GET' })
    .reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await inspectProject(unleash, { kind: 'project', project });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});
