import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { ensureFlag } from './ensureFlag.ts';

const project = 'mcp-server';
const flag = 'mcp-flag';
const features = `/api/admin/projects/${project}/features`;
const feature = `${features}/${flag}`;

test('fails with the Unleash error when the flag cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: feature, method: 'GET' })
    .reply(401, unleashError('AuthenticationRequired', 'You must log in to use Unleash'));

  const output = await ensureFlag(unleash, project, { flag, environment: 'development' });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 401,
    name: 'AuthenticationRequired',
    reasons: ['You must log in to use Unleash'],
  });
});

test('fails with the Unleash error when the flag cannot be created', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: feature, method: 'GET' })
    .reply(404, unleashError('NotFoundError', `Could not find feature flag ${flag}`));
  stub
    .intercept({ path: features, method: 'POST' })
    .reply(403, unleashError('PermissionError', 'You need the CREATE_FEATURE permission'));

  const output = await ensureFlag(unleash, project, { flag, environment: 'development' });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 403,
    name: 'PermissionError',
    reasons: ['You need the CREATE_FEATURE permission'],
  });
});

// No stub for any write: a release that changes the environment would fail the test differently.
test('refuses to replace targets that are not gradual rollouts', async () => {
  const { unleash, stub } = createStubbedClient();
  const strategies = [
    { id: 's1', name: 'remoteAddress', title: 'Office IPs' },
    { id: 's2', name: 'userWithId' },
  ];
  stub
    .intercept({ path: feature, method: 'GET' })
    .reply(200, { name: flag, environments: [{ name: 'development', enabled: true, strategies }] });

  const output = await ensureFlag(unleash, project, { flag, environment: 'development' });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 409,
    name: 'ConflictError',
    reasons: [
      'development has targets that are not gradual rollouts (Office IPs, userWithId); change them in the Unleash UI first',
    ],
  });
});

test('replaces the legacy target that serves everyone', async () => {
  const { unleash, stub } = createStubbedClient();
  const strategies = [{ id: 's1', name: 'default' }];
  stub
    .intercept({ path: feature, method: 'GET' })
    .reply(200, { name: flag, environments: [{ name: 'development', enabled: true, strategies }] });

  const output = await ensureFlag(unleash, project, { flag, environment: 'development' });

  assert.deepEqual(output, { kind: 'found', state: 'enabled', strategyIds: ['s1'] });
});
