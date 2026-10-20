import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createStubbedClient, createRecordedClient } from '../unleash/testClient.ts';
import { createRelease } from './release.ts';

const { unleash, close } = createRecordedClient(new URL('./release.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-flag';

// Archiving and then deleting from the archive removes the flag for good, so the first release creates it.
const deleteFlag = async (): Promise<void> => {
  await unleash.DELETE('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId: project, featureName: flag } },
  });
  await unleash.DELETE('/api/admin/archive/{featureName}', { params: { path: { featureName: flag } } });
};

before(deleteFlag);
after(close);

test('asks to confirm before creating a missing flag', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });

  assert.deepEqual(output, {
    kind: 'confirm',
    input: 'createFlag',
    message: `Flag "${flag}" does not exist in project ${project}. Create it?`,
  });
});

test('creates the flag when confirmed', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }], createFlag: true });

  assert.deepEqual(output, { kind: 'released', flag: { status: 'new', name: flag }, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });
});

test('releases an existing flag', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });

  assert.deepEqual(output, { kind: 'released', flag: { status: 'existing', name: flag }, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });
});

test('releases to several audiences', async () => {
  const release = createRelease(unleash);
  const beta = { field: 'userId', operator: 'IN' as const, values: ['1', '2'] };
  const blue = { name: 'blue', payload: { type: 'string' as const, value: 'blue' } };

  const output = await release({ project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }, { name: 'Beta testers', constraints: [beta], value: blue }] });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { status: 'existing', name: flag },
    environment: 'development',
    targets: [{ name: 'Everyone', rollout: 50 }, { name: 'Beta testers', rollout: 100, constraints: [beta], value: blue }],
  });
});

test('removes the audiences a release leaves out', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag, environment: 'development', targets: [{ name: 'Beta testers' }] });

  assert.deepEqual(output, { kind: 'released', flag: { status: 'existing', name: flag }, environment: 'development', targets: [{ name: 'Beta testers', rollout: 100 }] });
});

test('asks which project when none is given', async () => {
  const release = createRelease(unleash);

  const output = await release({ flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });

  assert.equal(output.kind, 'choose');
  assert.equal(output.input, 'project');
  assert.equal(output.message, 'Which project?');
  // The sandbox project list changes between recordings, so only the fixture project is checked.
  assert.ok(output.options.includes(project));
});

test('asks which environment when none is given', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag, targets: [{ name: 'Everyone', rollout: 50 }] });

  assert.equal(output.kind, 'choose');
  assert.equal(output.input, 'environment');
  assert.equal(output.message, 'Which environment?');
  assert.ok(output.options.includes('development'));
});

test('asks again when the environment is not enabled in the project', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag, environment: 'nope', targets: [{ name: 'Everyone', rollout: 50 }] });

  assert.equal(output.kind, 'choose');
  assert.equal(output.input, 'environment');
  assert.equal(output.message, `Environment "nope" is not enabled in project ${project}. Which environment?`);
  assert.ok(output.options.includes('development'));
});

const unleashError = (name: string, message: string) => ({ id: '0b84c7fd-5278-4087-832d-0b502c7929b3', name, message, details: [{ message }] });

const feature = `/api/admin/projects/${project}/features/${flag}`;
const base = `${feature}/environments/development`;

const stubEnvironments = (stub: ReturnType<typeof createStubbedClient>['stub']): void => {
  stub
    .intercept({ path: `/api/admin/environments/project/${project}`, method: 'GET' })
    .reply(200, { version: 1, environments: [{ name: 'development', enabled: true }] });
};

test('fails with the Unleash error when the rollout cannot be set', async () => {
  const { unleash, stub } = createStubbedClient();
  const release = createRelease(unleash);
  stubEnvironments(stub);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, { name: flag });
  stub.intercept({ path: `${base}/strategies`, method: 'POST' }).reply(400, unleashError('BadDataError', 'You have not added the current environment to the project'));

  const output = await release({ project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });

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
  stubEnvironments(stub);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, { name: flag });
  stub.intercept({ path: `${base}/strategies`, method: 'POST' }).reply(200, {});
  stub.intercept({ path: `${base}/on`, method: 'POST' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await release({ project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});

const development = (...strategyIds: string[]) => ({
  name: flag,
  environments: [{ name: 'development', enabled: true, strategies: strategyIds.map((id) => ({ id, name: 'flexibleRollout' })) }],
});

test('fails with the Unleash error when an audience cannot be changed', async () => {
  const { unleash, stub } = createStubbedClient();
  const release = createRelease(unleash);
  stubEnvironments(stub);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1'));
  stub.intercept({ path: `${base}/strategies/s1`, method: 'PUT' }).reply(403, unleashError('PermissionError', 'You need the UPDATE_FEATURE_STRATEGY permission'));

  const output = await release({ project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });

  assert.deepEqual(output, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the UPDATE_FEATURE_STRATEGY permission'] });
});

test('fails with the Unleash error when a left out audience cannot be removed', async () => {
  const { unleash, stub } = createStubbedClient();
  const release = createRelease(unleash);
  stubEnvironments(stub);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1', 's2'));
  stub.intercept({ path: `${base}/strategies/s1`, method: 'PUT' }).reply(200, {});
  stub.intercept({ path: `${base}/strategies/s2`, method: 'DELETE' }).reply(403, unleashError('PermissionError', 'You need the DELETE_FEATURE_STRATEGY permission'));

  const output = await release({ project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });

  assert.deepEqual(output, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the DELETE_FEATURE_STRATEGY permission'] });
});

// No stub for enabling: a request to turn the environment on would fail the release.
test('leaves an enabled environment as it is', async () => {
  const { unleash, stub } = createStubbedClient();
  const release = createRelease(unleash);
  stubEnvironments(stub);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1'));
  stub.intercept({ path: `${base}/strategies/s1`, method: 'PUT' }).reply(200, {});

  const output = await release({ project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });

  assert.equal(output.kind, 'released');
});

test('fails on an error reply without a body', async () => {
  const { unleash, stub } = createStubbedClient();
  const release = createRelease(unleash);
  stubEnvironments(stub);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, { name: flag });
  stub.intercept({ path: `${base}/strategies`, method: 'POST' }).reply(503, '', { headers: { 'content-length': '0' } });

  const output = await release({ project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });

  assert.deepEqual(output, { kind: 'failed', status: 503, name: 'UnknownError', reasons: [] });
});
