import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { createSearch } from './search.ts';

// What each query returns is pinned by its own step's tests; here only the order and the inline failures matter.
test('answers each query in the order asked, failures included', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments', method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));
  stub.intercept({ path: '/api/admin/segments', method: 'GET' }).reply(200, { segments: [{ id: 1, name: 'Beta', createdAt: '2026-10-22T08:00:00.000Z', usedInProjects: 2, usedInFeatures: 3 }] });
  stub.intercept({ path: '/api/admin/context', query: { include: 'project' }, method: 'GET' }).reply(200, [{ name: 'tier' }]);
  const search = createSearch(unleash);

  const output = await search({ queries: [{ kind: 'segments', query: 'beta' }, { kind: 'segments', query: 'beta' }, { kind: 'context_fields' }] });

  assert.deepEqual(output, {
    results: [
      { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] },
      { kind: 'segments', segments: [{ id: 1, name: 'Beta', createdAt: '2026-10-22T08:00:00.000Z', usedInProjects: 2, usedInFlags: 3 }] },
      { kind: 'context_fields', fields: [{ name: 'tier', usedInProjects: 0, usedInFlags: 0 }] },
    ],
  });
});
