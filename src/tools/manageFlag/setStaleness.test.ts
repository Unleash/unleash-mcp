import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteFlag } from '../../unleash/testSetup.ts';
import { setStaleness } from './setStaleness.ts';

const { unleash, admin, close } = createRecordedClient(
  new URL('./setStaleness.snapshot.json', import.meta.url).pathname,
);
const project = 'mcp-server';
const flag = 'mcp-stale-flag';

before(async () => {
  await deleteFlag(admin, project, flag);
  await admin.POST('/api/admin/projects/{projectId}/features', {
    params: { path: { projectId: project } },
    body: { name: flag },
  });
});
after(async () => {
  await deleteFlag(admin, project, flag);
  await close();
});

test('marks a flag stale', async () => {
  const outcome = await setStaleness(unleash, { action: 'set_staleness', project, flag, staleness: 'stale' });

  assert.deepEqual(outcome, { kind: 'applied' });
});

const feature = '/api/admin/projects/web/features/checkout';

// Only the exact patch matches, so another operation, path or value fails the test.
test('marks a flag active again', async () => {
  const { unleash, stub } = createStubbedClient();
  const unstale = (body: string): boolean =>
    isDeepStrictEqual(JSON.parse(body), [{ op: 'replace', path: '/stale', value: false }]);
  stub.intercept({ path: feature, method: 'PATCH', body: unstale }).reply(200, { name: 'checkout', stale: false });

  const outcome = await setStaleness(unleash, {
    action: 'set_staleness',
    project: 'web',
    flag: 'checkout',
    staleness: 'active',
  });

  assert.deepEqual(outcome, { kind: 'applied' });
});

test('fails with the Unleash error when the flag does not exist', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'No feature named missing';
  stub
    .intercept({ path: '/api/admin/projects/web/features/missing', method: 'PATCH' })
    .reply(404, unleashError('NotFoundError', message));

  const outcome = await setStaleness(unleash, {
    action: 'set_staleness',
    project: 'web',
    flag: 'missing',
    staleness: 'stale',
  });

  assert.deepEqual(outcome, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});
