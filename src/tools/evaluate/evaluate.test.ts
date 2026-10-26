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
const environment = 'development';

before(async () => {
  await deleteFlag(admin, project, flag);
  await createRelease(admin)({ project, flag: { name: flag, state: 'on' }, environment, targets: [{ name: 'Beta', constraints: [{ field: 'userId', operator: 'IN', values: ['1'] }] }] });
});
after(async () => {
  await deleteFlag(admin, project, flag);
  await close();
});

test('the feature is on for a context a target matches', async () => {
  const evaluate = createEvaluate(unleash);

  const output = await evaluate({ queries: [{ flag, environment, context: { appName: 'unleash-mcp', userId: '1' } }] });

  assert.deepEqual(output, { results: [{ kind: 'evaluated', flag, environment, result: 'on' }] });
});

test('the feature is off for a context no target matches', async () => {
  const evaluate = createEvaluate(unleash);

  const output = await evaluate({ queries: [{ flag, environment, context: { appName: 'unleash-mcp', userId: '2' } }] });

  assert.deepEqual(output, { results: [{ kind: 'evaluated', flag, environment, result: 'off' }] });
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
