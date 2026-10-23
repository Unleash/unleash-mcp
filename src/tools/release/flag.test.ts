import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { ensureFlag } from './flag.ts';

const project = 'mcp-server';
const flag = 'mcp-flag';
const features = `/api/admin/projects/${project}/features`;
const feature = `${features}/${flag}`;

test('fails with the Unleash error when the flag cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: feature, method: 'GET' }).reply(401, unleashError('AuthenticationRequired', 'You must log in to use Unleash'));

  const output = await ensureFlag(unleash, project, { flag, state: 'on', environment: 'development' });

  assert.deepEqual(output, { kind: 'failed', status: 401, name: 'AuthenticationRequired', reasons: ['You must log in to use Unleash'] });
});

test('fails with the Unleash error when the flag cannot be created', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: feature, method: 'GET' }).reply(404, unleashError('NotFoundError', `Could not find feature flag ${flag}`));
  stub.intercept({ path: features, method: 'POST' }).reply(403, unleashError('PermissionError', 'You need the CREATE_FEATURE permission'));

  const output = await ensureFlag(unleash, project, { flag, state: 'on', environment: 'development' });

  assert.deepEqual(output, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the CREATE_FEATURE permission'] });
});

// No stub for creating the flag: a request to create it would fail the test.
test('fails without creating the flag when a missing flag is turned off', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: feature, method: 'GET' }).reply(404, unleashError('NotFoundError', `Could not find feature flag ${flag}`));

  const output = await ensureFlag(unleash, project, { flag, state: 'off', environment: 'development' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [`Could not find feature flag ${flag}`] });
});
