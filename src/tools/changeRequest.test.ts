import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Interceptable } from 'undici';
import { createStubbedClient } from '../unleash/testClient.ts';
import { createRouter } from './changeRequest.ts';

const project = 'mcp-server';
const uiConfig = '/api/admin/ui-config';
const config = `/api/admin/projects/${project}/change-requests/config`;
const unleashError = (name: string, message: string) => ({ id: '0b84c7fd-5278-4087-832d-0b502c7929b3', name, message, details: [{ message }] });

const enterprise = { environment: 'Enterprise', versionInfo: { current: { oss: '8.2.0', enterprise: '8.2.1' } } };
const changeRequestsIn = (environment: string) => [
  { environment: 'development', type: 'development', requiredApprovals: null, changeRequestEnabled: false },
  { environment, type: 'production', requiredApprovals: 1, changeRequestEnabled: true },
];

const stubEdition = (stub: Interceptable, edition: object) => stub.intercept({ path: uiConfig, method: 'GET' }).reply(200, edition);

test('routes to a change request when the environment requires them', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(200, changeRequestsIn('production'));

  const route = await createRouter(unleash)(project, 'production');

  assert.deepEqual(route, { kind: 'changeRequest' });
});

test('writes directly when the environment does not require change requests', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(200, changeRequestsIn('production'));

  const route = await createRouter(unleash)(project, 'development');

  assert.deepEqual(route, { kind: 'direct' });
});

// No stub for the change request config: reading it would fail the test.
test('writes directly on open source without asking for change requests', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, { versionInfo: { current: { oss: '8.2.0', enterprise: '' } } });

  const route = await createRouter(unleash)(project, 'production');

  assert.deepEqual(route, { kind: 'direct' });
});

test('writes directly on Pro without asking for change requests', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, { ...enterprise, environment: 'Pro' });

  const route = await createRouter(unleash)(project, 'production');

  assert.deepEqual(route, { kind: 'direct' });
});

// The edition is stubbed once: reading it again would fail the second call.
test('reads the edition once', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(200, changeRequestsIn('production')).times(2);
  const route = createRouter(unleash);
  await route(project, 'production');

  const second = await route(project, 'production');

  assert.deepEqual(second, { kind: 'changeRequest' });
});

test('reads the edition again after it could not be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: uiConfig, method: 'GET' }).reply(503, unleashError('UnknownError', 'Service unavailable'));
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(200, changeRequestsIn('production'));
  const route = createRouter(unleash);
  const first = await route(project, 'production');

  const second = await route(project, 'production');

  assert.deepEqual(first, { kind: 'failed', status: 503, name: 'UnknownError', reasons: ['Service unavailable'] });
  assert.deepEqual(second, { kind: 'changeRequest' });
});

test('fails with the Unleash error when the change request config cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(403, unleashError('PermissionError', 'You need the READ_PROJECT permission'));

  const route = await createRouter(unleash)(project, 'production');

  assert.deepEqual(route, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the READ_PROJECT permission'] });
});
