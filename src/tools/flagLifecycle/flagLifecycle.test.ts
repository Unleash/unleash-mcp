import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { createFlagLifecycle } from './flagLifecycle.ts';

// What each operation does is pinned by its own step's tests; here only the order and the inline failures matter.
test('applies the operations after a failed one, naming the operation each result answers', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'There\'s no feature named "gone" in project "web".';
  stub.intercept({ path: '/api/admin/projects/web/features/gone/lifecycle/complete', method: 'POST' }).reply(404, unleashError('NotFoundError', message));
  stub.intercept({ path: '/api/admin/projects/web/features/checkout', method: 'GET' }).reply(404, unleashError('NotFoundError', 'No feature named checkout'));
  stub.intercept({ path: '/api/admin/projects/web/features', method: 'POST' }).reply(201, { name: 'checkout' });
  const flagLifecycle = createFlagLifecycle(unleash);

  const output = await flagLifecycle({ operations: [
    { action: 'complete', project: 'web', flag: 'gone', outcome: { kind: 'discarded' } },
    { action: 'define', project: 'web', flag: 'checkout' },
  ] });

  assert.deepEqual(output, {
    results: [
      { kind: 'failed', action: 'complete', project: 'web', flag: 'gone', error: { status: 404, name: 'NotFoundError', reasons: [message] } },
      { kind: 'applied', action: 'define', project: 'web', flag: 'checkout', status: 'new', changed: [] },
    ],
  });
});
