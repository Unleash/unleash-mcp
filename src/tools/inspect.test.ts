import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../unleash/testClient.ts';
import { unleashError } from '../unleash/testError.ts';
import { createInspect } from './inspect.ts';

// What each query returns is pinned by its own step's tests; here only the order and the inline failures matter.
test('answers each query in the order asked, failures included', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/projects/unknown/overview', method: 'GET' }).reply(404, unleashError('NotFoundError', 'No project found'));
  stub.intercept({ path: '/api/admin/projects/known/overview', method: 'GET' }).reply(200, { environments: [{ environment: 'development' }] });
  const inspect = createInspect(unleash);

  const output = await inspect({ queries: [{ kind: 'project', project: 'unknown' }, { kind: 'project', project: 'known' }] });

  assert.deepEqual(output, {
    results: [
      { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['No project found'] },
      { kind: 'project', environments: ['development'] },
    ],
  });
});
