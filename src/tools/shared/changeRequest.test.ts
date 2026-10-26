import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Interceptable } from 'undici';
import type { UnleashClient } from '../../unleash/client.ts';
import { createStubbedClient } from '../../unleash/testClient.ts';
import { createChangeRequestReader, requestChanges, routeToEnvironment, routeToProject } from './changeRequest.ts';

const project = 'mcp-server';
const uiConfig = '/api/admin/ui-config';
const config = `/api/admin/projects/${project}/change-requests/config`;
const unleashError = (name: string, message: string) => ({ id: '0b84c7fd-5278-4087-832d-0b502c7929b3', name, message, details: [{ message }] });

const enterprise = { environment: 'Enterprise', versionInfo: { current: { oss: '8.2.0', enterprise: '8.2.1' } } };
const changeRequestsIn = (environment: string) => [
  { environment: 'development', type: 'development', requiredApprovals: null, changeRequestEnabled: false },
  { environment, type: 'production', requiredApprovals: 1, changeRequestEnabled: true },
];

const routeTo = (unleash: UnleashClient) => {
  const environmentsOf = createChangeRequestReader(unleash);
  return (environment: string) => routeToEnvironment(environmentsOf, project, environment);
};
const stubEdition = (stub: Interceptable, edition: object) => stub.intercept({ path: uiConfig, method: 'GET' }).reply(200, edition);

test('routes to a change request when the environment requires them', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(200, changeRequestsIn('production'));

  const route = await routeTo(unleash)('production');

  assert.deepEqual(route, { kind: 'changeRequest', project, environment: 'production' });
});

test('writes directly when the environment does not require change requests', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(200, changeRequestsIn('production'));

  const route = await routeTo(unleash)('development');

  assert.deepEqual(route, { kind: 'direct' });
});

// No stub for the change request config: reading it would fail the test.
test('writes directly on open source without asking for change requests', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, { versionInfo: { current: { oss: '8.2.0', enterprise: '' } } });

  const route = await routeTo(unleash)('production');

  assert.deepEqual(route, { kind: 'direct' });
});

test('writes directly on Pro without asking for change requests', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, { ...enterprise, environment: 'Pro' });

  const route = await routeTo(unleash)('production');

  assert.deepEqual(route, { kind: 'direct' });
});

// The edition is stubbed once: reading it again would fail the second call.
test('reads the edition once', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(200, changeRequestsIn('production')).times(2);
  const route = routeTo(unleash);
  await route('production');

  const second = await route('production');

  assert.deepEqual(second, { kind: 'changeRequest', project, environment: 'production' });
});

test('reads the edition again after it could not be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: uiConfig, method: 'GET' }).reply(503, unleashError('UnknownError', 'Service unavailable'));
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(200, changeRequestsIn('production'));
  const route = routeTo(unleash);
  const first = await route('production');

  const second = await route('production');

  assert.deepEqual(first, { kind: 'failed', status: 503, name: 'UnknownError', reasons: ['Service unavailable'] });
  assert.deepEqual(second, { kind: 'changeRequest', project, environment: 'production' });
});

test('fails with the Unleash error when the change request config cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(403, unleashError('PermissionError', 'You need the READ_PROJECT permission'));

  const route = await routeTo(unleash)('production');

  assert.deepEqual(route, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the READ_PROJECT permission'] });
});

test('routes a project change to a change request in a production environment first, as the Unleash UI does', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(200, [
    { environment: 'staging', type: 'development', requiredApprovals: 1, changeRequestEnabled: true },
    ...changeRequestsIn('live'),
  ]);

  const route = await routeToProject(createChangeRequestReader(unleash), project);

  assert.deepEqual(route, { kind: 'changeRequest', project, environment: 'live' });
});

test('routes a project change to the first environment needing approval when none is production', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(200, [
    { environment: 'development', type: 'development', requiredApprovals: null, changeRequestEnabled: false },
    { environment: 'staging', type: 'test', requiredApprovals: 1, changeRequestEnabled: true },
  ]);

  const route = await routeToProject(createChangeRequestReader(unleash), project);

  assert.deepEqual(route, { kind: 'changeRequest', project, environment: 'staging' });
});

test('writes a project change directly when no environment requires change requests', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(200, [{ environment: 'production', type: 'production', requiredApprovals: null, changeRequestEnabled: false }]);

  const route = await routeToProject(createChangeRequestReader(unleash), project);

  assert.deepEqual(route, { kind: 'direct' });
});

test('fails with the Unleash error when the change request config cannot be read for a project change', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEdition(stub, enterprise);
  stub.intercept({ path: config, method: 'GET' }).reply(403, unleashError('PermissionError', 'You need the READ_PROJECT permission'));

  const route = await routeToProject(createChangeRequestReader(unleash), project);

  assert.deepEqual(route, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the READ_PROJECT permission'] });
});

const route = { kind: 'changeRequest' as const, project, environment: 'production' };
const changeRequests = `/api/admin/projects/${project}/environments/production/change-requests`;
const defaultChange = { action: 'deleteSegment' as const, payload: { id: 42 } };
const draft = { id: 7, state: 'Draft', environment: 'production', project, minApprovals: 1, features: [], segments: [] };
const submitted = `/api/admin/projects/${project}/change-requests/7/state`;

// Only a request for review matches, so a change request that isn't submitted fails the test.
test('submits the change request it opens for review', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: changeRequests, method: 'POST' }).reply(200, draft);
  const toReview = (body: string): boolean => JSON.parse(body).state === 'In review';
  stub.intercept({ path: submitted, method: 'PUT', body: toReview }).reply(200, { ...draft, state: 'In review' });

  const requested = await requestChanges(unleash, route, defaultChange);

  assert.deepEqual(requested, { kind: 'requested', changeRequest: { id: 7, state: 'In review', url: `https://unleash.example/projects/${project}/change-requests/7` } });
});

test('fails with the Unleash error when the change request cannot be opened', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: changeRequests, method: 'POST' }).reply(403, unleashError('PermissionError', 'You need the CREATE_FEATURE_STRATEGY permission'));

  const requested = await requestChanges(unleash, route, defaultChange);

  assert.deepEqual(requested, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the CREATE_FEATURE_STRATEGY permission'] });
});

// No stub for submitting: submitting again would fail the test.
test('leaves a change request that is already in review as it is', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: changeRequests, method: 'POST' }).reply(200, { ...draft, state: 'In review' });

  const requested = await requestChanges(unleash, route, defaultChange);

  assert.deepEqual(requested, { kind: 'requested', changeRequest: { id: 7, state: 'In review', url: `https://unleash.example/projects/${project}/change-requests/7` } });
});

test('fails with the Unleash error when the change request cannot be submitted', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: changeRequests, method: 'POST' }).reply(200, draft);
  stub.intercept({ path: submitted, method: 'PUT' }).reply(403, unleashError('PermissionError', 'You need the APPROVE_CHANGE_REQUEST permission'));

  const requested = await requestChanges(unleash, route, defaultChange);

  assert.deepEqual(requested, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the APPROVE_CHANGE_REQUEST permission'] });
});
