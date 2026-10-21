import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import type { Interceptable } from 'undici';
import { createStubbedClient } from '../unleash/testClient.ts';
import { createRouter, requestChanges } from './changeRequest.ts';

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

const path = { projectId: project, featureName: 'mcp-flag', environment: 'production' };
const changeRequests = `/api/admin/projects/${project}/environments/production/change-requests`;
const defaultStrategy = { name: 'flexibleRollout', title: 'Everyone', parameters: { rollout: '100', stickiness: 'default', groupId: 'mcp-flag' }, constraints: [], segments: [], variants: [] };
const defaultPlan = { updates: [], adds: [], deletes: [], enable: false };
const draft = { id: 7, state: 'Draft', environment: 'production', project, minApprovals: 1, features: [], segments: [] };
const submitted = `/api/admin/projects/${project}/change-requests/7/state`;
// Only a request for review matches, so a release that doesn't submit fails the test.
const toReview = (body: string): boolean => JSON.parse(body).state === 'In review';
const stubSubmit = (stub: Interceptable) => stub.intercept({ path: submitted, method: 'PUT', body: toReview }).reply(200, { ...draft, state: 'In review' });

test('submits every change of a release in one change request', async () => {
  const { unleash, stub } = createStubbedClient();
  const beta = { ...defaultStrategy, title: 'Beta testers' };
  const actions = (body: string): boolean =>
    isDeepStrictEqual(JSON.parse(body), [
      { feature: 'mcp-flag', action: 'updateStrategy', payload: { id: 's1', ...defaultStrategy } },
      { feature: 'mcp-flag', action: 'addStrategy', payload: beta },
      { feature: 'mcp-flag', action: 'deleteStrategy', payload: { id: 's2' } },
      { feature: 'mcp-flag', action: 'updateEnabled', payload: { enabled: true } },
    ]);
  stub.intercept({ path: changeRequests, method: 'POST', body: actions }).reply(200, draft);
  stubSubmit(stub);

  const requested = await requestChanges(unleash, path, { updates: [{ id: 's1', strategy: defaultStrategy }], adds: [beta], deletes: ['s2'], enable: true });

  assert.deepEqual(requested, { kind: 'requested', changeRequest: { id: 7, state: 'In review' } });
});

test('leaves an enabled environment as it is in the change request', async () => {
  const { unleash, stub } = createStubbedClient();
  const onlyAdds = (body: string): boolean => JSON.parse(body).every((c: { action: string }) => c.action === 'addStrategy');
  stub.intercept({ path: changeRequests, method: 'POST', body: onlyAdds }).reply(200, draft);
  stubSubmit(stub);

  const requested = await requestChanges(unleash, path, { ...defaultPlan, adds: [defaultStrategy] });

  assert.equal(requested.kind, 'requested');
});

test('fails with the Unleash error when the change request cannot be opened', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: changeRequests, method: 'POST' }).reply(403, unleashError('PermissionError', 'You need the CREATE_FEATURE_STRATEGY permission'));

  const requested = await requestChanges(unleash, path, { ...defaultPlan, adds: [defaultStrategy] });

  assert.deepEqual(requested, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the CREATE_FEATURE_STRATEGY permission'] });
});

// No stub for submitting: submitting again would fail the test.
test('leaves a change request that is already in review as it is', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: changeRequests, method: 'POST' }).reply(200, { ...draft, state: 'In review' });

  const requested = await requestChanges(unleash, path, { ...defaultPlan, adds: [defaultStrategy] });

  assert.deepEqual(requested, { kind: 'requested', changeRequest: { id: 7, state: 'In review' } });
});

test('fails with the Unleash error when the change request cannot be submitted', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: changeRequests, method: 'POST' }).reply(200, draft);
  stub.intercept({ path: submitted, method: 'PUT' }).reply(403, unleashError('PermissionError', 'You need the APPROVE_CHANGE_REQUEST permission'));

  const requested = await requestChanges(unleash, path, { ...defaultPlan, adds: [defaultStrategy] });

  assert.deepEqual(requested, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the APPROVE_CHANGE_REQUEST permission'] });
});
