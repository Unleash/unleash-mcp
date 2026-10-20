import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createStubbedClient, createRecordedClient } from '../unleash/testClient.ts';
import { createRelease } from './release.ts';

const { unleash, close } = createRecordedClient(new URL('./release.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-flag';

const recreateFlag = async (): Promise<void> => {
  await unleash.DELETE('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId: project, featureName: flag } },
  });
  await unleash.DELETE('/api/admin/archive/{featureName}', { params: { path: { featureName: flag } } });
  const { error } = await unleash.POST('/api/admin/projects/{projectId}/features', {
    params: { path: { projectId: project } },
    body: { name: flag },
  });
  if (error) throw new Error('create flag failed');
};

before(recreateFlag);
after(close);

test('releases a flag to a percentage of users', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag, environment: 'development', rollout: 50 });

  assert.deepEqual(output, { kind: 'released', flag, environment: 'development', rollout: 50 });
});

const unleashError = (name: string, message: string) => ({ id: '0b84c7fd-5278-4087-832d-0b502c7929b3', name, message, details: [{ message }] });

const base = `/api/admin/projects/${project}/features/${flag}/environments/development`;

test('fails with the Unleash error when the rollout cannot be set', async () => {
  const { unleash, stub } = createStubbedClient();
  const release = createRelease(unleash);
  stub.intercept({ path: `${base}/strategies`, method: 'POST' }).reply(400, unleashError('BadDataError', 'You have not added the current environment to the project'));

  const output = await release({ project, flag, environment: 'development', rollout: 50 });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 400,
    name: 'BadDataError',
    reasons: ['You have not added the current environment to the project'],
  });
});

test('fails with the Unleash error when the environment cannot be enabled', async () => {
  const { unleash, stub } = createStubbedClient();
  const release = createRelease(unleash);
  stub.intercept({ path: `${base}/strategies`, method: 'POST' }).reply(200, {});
  stub.intercept({ path: `${base}/on`, method: 'POST' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await release({ project, flag, environment: 'development', rollout: 50 });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});
