import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { inspectLifecycleStages } from './lifecycleStages.ts';

const { unleash, close } = createRecordedClient(new URL('./lifecycleStages.snapshot.json', import.meta.url).pathname);
after(close);

test('lists every lifecycle stage in order, as the UI names them', async () => {
  const output = await inspectLifecycleStages(unleash);

  assert.deepEqual(output, {
    kind: 'lifecycle_stages',
    stages: ['define', 'develop', 'production', 'cleanup', 'archived'],
  });
});

test('leaves out a stage Unleash answers before the tools name it', async () => {
  const { unleash: stubbed, stub } = createStubbedClient();
  stub
    .intercept({ path: '/api/admin/lifecycle/count', method: 'GET' })
    .reply(200, { initial: 1, preLive: 2, live: 3, onHold: 4, completed: 5, archived: 6 });

  const output = await inspectLifecycleStages(stubbed);

  assert.deepEqual(output, {
    kind: 'lifecycle_stages',
    stages: ['define', 'develop', 'production', 'cleanup', 'archived'],
  });
});

test('lists the stages in the order a flag moves through them, whatever order Unleash sends them in', async () => {
  const { unleash: stubbed, stub } = createStubbedClient();
  stub
    .intercept({ path: '/api/admin/lifecycle/count', method: 'GET' })
    .reply(200, { archived: 1, live: 2, initial: 3, completed: 4, preLive: 5 });

  const output = await inspectLifecycleStages(stubbed);

  assert.deepEqual(output, {
    kind: 'lifecycle_stages',
    stages: ['define', 'develop', 'production', 'cleanup', 'archived'],
  });
});

test('passes on what Unleash said when it refuses', async () => {
  const { unleash: stubbed, stub } = createStubbedClient();
  stub
    .intercept({ path: '/api/admin/lifecycle/count', method: 'GET' })
    .reply(403, unleashError('PermissionError', 'You need the ADMIN permission'));

  const output = await inspectLifecycleStages(stubbed);

  assert.deepEqual(output, {
    kind: 'failed',
    status: 403,
    name: 'PermissionError',
    reasons: ['You need the ADMIN permission'],
  });
});
