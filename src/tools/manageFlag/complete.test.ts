import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteFlag } from '../../unleash/testSetup.ts';
import { completeFlag } from './complete.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./complete.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-completed-flag';

before(async () => {
  await deleteFlag(admin, project, flag);
  await admin.POST('/api/admin/projects/{projectId}/features', { params: { path: { projectId: project } }, body: { name: flag } });
});
after(async () => {
  await deleteFlag(admin, project, flag);
  await close();
});

test('marks a flag completed with the feature kept', async () => {
  const outcome = await completeFlag(unleash, { action: 'complete', project, flag, outcome: { kind: 'kept' } });

  assert.deepEqual(outcome, { kind: 'applied' });
});

const complete = '/api/admin/projects/web/features/checkout/lifecycle/complete';

// Only the exact body matches, so an outcome spelled differently fails the test.
test('marks a flag completed with the feature discarded', async () => {
  const { unleash, stub } = createStubbedClient();
  const discarded = (body: string): boolean => isDeepStrictEqual(JSON.parse(body), { status: 'discarded' });
  stub.intercept({ path: complete, method: 'POST', body: discarded }).reply(200);

  const outcome = await completeFlag(unleash, { action: 'complete', project: 'web', flag: 'checkout', outcome: { kind: 'discarded' } });

  assert.deepEqual(outcome, { kind: 'applied' });
});

// Only a body naming the kept value matches, so sending it under another key or leaving it out fails the test.
test('records which value was kept', async () => {
  const { unleash, stub } = createStubbedClient();
  const kept = (body: string): boolean => isDeepStrictEqual(JSON.parse(body), { status: 'kept', statusValue: 'blue' });
  stub.intercept({ path: complete, method: 'POST', body: kept }).reply(200);

  const outcome = await completeFlag(unleash, { action: 'complete', project: 'web', flag: 'checkout', outcome: { kind: 'kept', value: 'blue' } });

  assert.deepEqual(outcome, { kind: 'applied' });
});

test('fails with the Unleash error when the flag cannot be completed', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'There\'s no feature named "missing" in project "web".';
  stub.intercept({ path: '/api/admin/projects/web/features/missing/lifecycle/complete', method: 'POST' }).reply(404, unleashError('NotFoundError', message));

  const outcome = await completeFlag(unleash, { action: 'complete', project: 'web', flag: 'missing', outcome: { kind: 'discarded' } });

  assert.deepEqual(outcome, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});
