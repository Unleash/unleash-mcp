import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import type { Interceptable } from 'undici';
import { createStubbedClient } from '../../unleash/testClient.ts';
import { requestRelease } from './changeRequest.ts';

const project = 'mcp-server';

const path = { projectId: project, featureName: 'mcp-flag', environment: 'production' };
const changeRequests = `/api/admin/projects/${project}/environments/production/change-requests`;
const defaultStrategy = { name: 'flexibleRollout', title: 'Everyone', parameters: { rollout: '100', stickiness: 'default', groupId: 'mcp-flag' }, constraints: [], segments: [], variants: [] };
const defaultPlan = { updates: [], adds: [], deletes: [] };
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

  const requested = await requestRelease(unleash, path, { updates: [{ id: 's1', strategy: defaultStrategy }], adds: [beta], deletes: ['s2'], toggle: 'on' });

  assert.partialDeepStrictEqual(requested, { kind: 'requested', changeRequest: { id: 7 } });
});

test('applies the template before removing the audiences it replaces in the change request', async () => {
  const { unleash, stub } = createStubbedClient();
  const templateFirst = (body: string): boolean =>
    isDeepStrictEqual(JSON.parse(body), [
      { feature: 'mcp-flag', action: 'addReleasePlan', payload: { templateId: 't1' } },
      { feature: 'mcp-flag', action: 'deleteStrategy', payload: { id: 's1' } },
    ]);
  stub.intercept({ path: changeRequests, method: 'POST', body: templateFirst }).reply(200, draft);
  stubSubmit(stub);

  const requested = await requestRelease(unleash, path, { ...defaultPlan, deletes: ['s1'], template: 't1' });

  assert.equal(requested.kind, 'requested');
});

test('starts the milestone before removing the audiences it replaces in the change request', async () => {
  const { unleash, stub } = createStubbedClient();
  const milestoneFirst = (body: string): boolean =>
    isDeepStrictEqual(JSON.parse(body), [
      { feature: 'mcp-flag', action: 'startMilestone', payload: { planId: 'p1', milestoneId: 'm2' } },
      { feature: 'mcp-flag', action: 'deleteStrategy', payload: { id: 's1' } },
    ]);
  stub.intercept({ path: changeRequests, method: 'POST', body: milestoneFirst }).reply(200, draft);
  stubSubmit(stub);

  const requested = await requestRelease(unleash, path, { ...defaultPlan, deletes: ['s1'], milestone: { planId: 'p1', milestoneId: 'm2' } });

  assert.equal(requested.kind, 'requested');
});

test('turns the environment off before changing its audiences in the change request', async () => {
  const { unleash, stub } = createStubbedClient();
  const disablesFirst = (body: string): boolean =>
    isDeepStrictEqual(JSON.parse(body), [
      { feature: 'mcp-flag', action: 'updateEnabled', payload: { enabled: false } },
      { feature: 'mcp-flag', action: 'updateStrategy', payload: { id: 's1', ...defaultStrategy } },
    ]);
  stub.intercept({ path: changeRequests, method: 'POST', body: disablesFirst }).reply(200, draft);
  stubSubmit(stub);

  const requested = await requestRelease(unleash, path, { ...defaultPlan, updates: [{ id: 's1', strategy: defaultStrategy }], toggle: 'off' });

  assert.equal(requested.kind, 'requested');
});

test('leaves an enabled environment as it is in the change request', async () => {
  const { unleash, stub } = createStubbedClient();
  const onlyAdds = (body: string): boolean => JSON.parse(body).every((c: { action: string }) => c.action === 'addStrategy');
  stub.intercept({ path: changeRequests, method: 'POST', body: onlyAdds }).reply(200, draft);
  stubSubmit(stub);

  const requested = await requestRelease(unleash, path, { ...defaultPlan, adds: [defaultStrategy] });

  assert.equal(requested.kind, 'requested');
});
