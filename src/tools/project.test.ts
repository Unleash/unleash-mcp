import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../unleash/testClient.ts';
import { unleashError } from '../unleash/testError.ts';
import { searchProject } from './project.ts';

const { unleash, close } = createRecordedClient(new URL('./project.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';

after(close);

test('lists the environments of a project', async () => {
  const output = await searchProject(unleash, { kind: 'project', project });

  assert.deepEqual(output, { kind: 'project', environments: ['development', 'production'] });
});

test('fails with the Unleash error when the project does not exist', async () => {
  const output = await searchProject(unleash, { kind: 'project', project: 'unknown' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['No project found'] });
});


test('fails with the Unleash error when the project cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: `/api/admin/projects/${project}/overview`, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchProject(unleash, { kind: 'project', project });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
