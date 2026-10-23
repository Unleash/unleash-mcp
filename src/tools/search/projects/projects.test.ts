import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { searchProjects } from './projects.ts';

const { unleash, close } = createRecordedClient(new URL('./projects.snapshot.json', import.meta.url).pathname);

after(close);

// The sandbox project the tests run in is the only fixture, so it is what the search finds.
test('finds projects by a part of their id, case insensitive', async () => {
  const output = await searchProjects(unleash, { kind: 'projects', query: 'MCP-SERVER' });

  assert.partialDeepStrictEqual(output, { kind: 'projects', projects: [{ id: 'mcp-server', name: 'mcp-server' }] });
});

test('finds projects by a part of their name, case insensitive', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/projects', query: { view: 'core' }, method: 'GET' }).reply(200, {
    version: 1,
    projects: [{ id: 'default', name: 'Default' }, { id: 'web', name: 'Web shop' }, { id: 'ios', name: 'iOS app' }],
  });

  const output = await searchProjects(unleash, { kind: 'projects', query: 'SHOP' });

  assert.deepEqual(output, { kind: 'projects', projects: [{ id: 'web', name: 'Web shop' }] });
});

test('fails with the Unleash error when the projects cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/projects', query: { view: 'core' }, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchProjects(unleash, { kind: 'projects' });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
