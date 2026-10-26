import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteFlag } from '../../unleash/testSetup.ts';
import { createRelease } from '../release/release.ts';
import { createEvaluate } from './evaluate.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./evaluate.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-evaluated-flag';
const parent = 'mcp-evaluated-parent';
const child = 'mcp-evaluated-child';
const environment = 'development';
const sdkOnlyStrategy = 'mcp-custom-strategy';
const users = { targeted: '1', targetedBySdkOnly: '2', untargeted: '3' };

const addSdkOnlyTarget = (featureName: string, env: string) =>
  admin.POST('/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies', {
    params: { path: { projectId: project, featureName, environment: env } },
    body: { name: sdkOnlyStrategy, constraints: [{ contextName: 'userId', operator: 'IN', values: [users.targetedBySdkOnly], caseInsensitive: false, inverted: false }] },
  });

const deleteFlagsAndStrategy = async () => {
  for (const name of [flag, child, parent]) await deleteFlag(admin, project, name);
  await admin.DELETE('/api/admin/strategies/{name}', { params: { path: { name: sdkOnlyStrategy } } });
};

// The flags go first: Unleash refuses to delete a strategy in use. A new flag is off, so the parent stays unsatisfied.
before(async () => {
  await deleteFlagsAndStrategy();
  await admin.POST('/api/admin/strategies', { body: { name: sdkOnlyStrategy, parameters: [] } });
  await createRelease(admin)({ project, flag: { name: flag, state: 'on' }, environment, targets: [{ name: 'Beta', constraints: [{ field: 'userId', operator: 'IN', values: [users.targeted] }] }] });
  await addSdkOnlyTarget(flag, environment);
  await addSdkOnlyTarget(flag, 'production');
  for (const name of [parent, child]) await admin.POST('/api/admin/projects/{projectId}/features', { params: { path: { projectId: project } }, body: { name } });
  await addSdkOnlyTarget(child, environment);
  await admin.POST('/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on', { params: { path: { projectId: project, featureName: child, environment } } });
  await admin.POST('/api/admin/projects/{projectId}/features/{child}/dependencies', { params: { path: { projectId: project, child } }, body: { feature: parent } });
});
after(async () => {
  await deleteFlagsAndStrategy();
  await close();
});

const evaluateFor = (userId: string) => createEvaluate(unleash)({ queries: [{ flag, environment, context: { appName: 'unleash-mcp', userId } }] });

test('the feature is on for a context a target matches', async () => {
  const output = await evaluateFor(users.targeted);

  assert.deepEqual(output, { results: [{ kind: 'evaluated', flag, environment, result: 'on' }] });
});

test('the feature is unknown when only a target Unleash cannot evaluate could turn it on', async () => {
  const output = await evaluateFor(users.targetedBySdkOnly);

  assert.deepEqual(output, { results: [{ kind: 'evaluated', flag, environment, result: 'unknown' }] });
});

test('the feature is off for a context no target matches', async () => {
  const output = await evaluateFor(users.untargeted);

  assert.deepEqual(output, { results: [{ kind: 'evaluated', flag, environment, result: 'off' }] });
});

test('the feature is off when its environment is off or its parent is unsatisfied, whatever its targets', async () => {
  const context = { appName: 'unleash-mcp', userId: users.targetedBySdkOnly };

  const output = await createEvaluate(unleash)({ queries: [{ flag, environment: 'production', context }, { flag: child, environment, context }] });

  assert.deepEqual(output, {
    results: [
      { kind: 'evaluated', flag, environment: 'production', result: 'off' },
      { kind: 'evaluated', flag: child, environment, result: 'off' },
    ],
  });
});

test('answers each query in the order asked, a failure naming its flag and environment', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/playground/features/missing', method: 'POST' }).reply(404, unleashError('NotFoundError', 'Could not find feature flag missing'));
  stub.intercept({ path: `/api/admin/playground/features/${flag}`, method: 'POST' }).reply(200, { feature: { isEnabled: true } });
  const evaluate = createEvaluate(unleash);

  const output = await evaluate({
    queries: [{ flag: 'missing', environment, context: { appName: 'unleash-mcp' } }, { flag, environment, context: { appName: 'unleash-mcp' } }],
  });

  assert.deepEqual(output, {
    results: [
      { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['Could not find feature flag missing'], flag: 'missing', environment },
      { kind: 'evaluated', flag, environment, result: 'on' },
    ],
  });
});
