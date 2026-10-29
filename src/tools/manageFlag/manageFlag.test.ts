import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { production, stubChangeRequestsIn } from '../../unleash/testChangeRequest.ts';
import { createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { createManageFlag } from './manageFlag.ts';
import { manageFlagOutput } from './manageFlagOutput.ts';

// What each operation does is pinned by its own step's tests; here only the order, the inline failures, the
// change requests and the output schema matter. Every action is in it, so the schema must describe each one.
test('applies the operations after a failed one, naming the operation each result answers', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'There\'s no feature named "gone" in project "web".';
  stub
    .intercept({ path: '/api/admin/projects/web/features/gone/lifecycle/complete', method: 'POST' })
    .reply(404, unleashError('NotFoundError', message));
  stub
    .intercept({ path: '/api/admin/projects/web/features/checkout', method: 'GET' })
    .reply(404, unleashError('NotFoundError', 'No feature named checkout'));
  stub.intercept({ path: '/api/admin/projects/web/features', method: 'POST' }).reply(201, { name: 'checkout' });
  stubChangeRequestsIn(stub, 'web', production).times(2);
  stub
    .intercept({ path: '/api/admin/projects/web/environments/production/change-requests', method: 'POST' })
    .reply(200, { id: 7, state: 'In review' })
    .times(2);
  stub.intercept({ path: '/api/admin/projects/web/revive', method: 'POST' }).reply(200, '');
  stub
    .intercept({ path: '/api/admin/projects/web/features/checkout', method: 'PATCH' })
    .reply(200, { name: 'checkout' });
  const manageFlag = createManageFlag(unleash);

  const output = await manageFlag({
    operations: [
      { action: 'complete', project: 'web', flag: 'gone', outcome: { kind: 'discarded' } },
      { action: 'define', project: 'web', flag: 'checkout' },
      { action: 'archive', project: 'web', flag: 'old-checkout' },
      {
        action: 'set_parent_dependency',
        project: 'web',
        flag: 'checkout-v2',
        parent: { state: 'enabled', flag: 'checkout' },
      },
      { action: 'revive', project: 'web', flag: 'older-checkout' },
      { action: 'set_staleness', project: 'web', flag: 'checkout', staleness: 'stale' },
    ],
  });

  assert.equal(z.object(manageFlagOutput).safeParse(output).error, undefined);
  assert.equal(output.results.length, 6);
  assert.partialDeepStrictEqual(output, {
    results: [
      {
        kind: 'failed',
        action: 'complete',
        project: 'web',
        flag: 'gone',
        error: { status: 404, name: 'NotFoundError', reasons: [message] },
      },
      { kind: 'applied', action: 'define', project: 'web', flag: 'checkout', origin: 'created', changed: [] },
      {
        kind: 'pending_change_request',
        action: 'archive',
        project: 'web',
        flag: 'old-checkout',
        changeRequest: { id: 7 },
      },
      {
        kind: 'pending_change_request',
        action: 'set_parent_dependency',
        project: 'web',
        flag: 'checkout-v2',
        changeRequest: { id: 7 },
      },
      { kind: 'applied', action: 'revive', project: 'web', flag: 'older-checkout' },
      { kind: 'applied', action: 'set_staleness', project: 'web', flag: 'checkout' },
    ],
  });
});
