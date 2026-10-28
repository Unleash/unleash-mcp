import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { createSearch } from './search.ts';

// What each query returns is pinned by its own step's tests; here only the order and the inline failures matter.
test('answers each query in the order asked, failures included', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: '/api/admin/segments', method: 'GET' })
    .reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));
  stub.intercept({ path: '/api/admin/segments', method: 'GET' }).reply(200, {
    segments: [{ id: 1, name: 'Beta', createdAt: '2026-10-22T08:00:00.000Z', usedInProjects: 2, usedInFeatures: 3 }],
  });
  stub
    .intercept({ path: '/api/admin/context', query: { include: 'project' }, method: 'GET' })
    .reply(200, [{ name: 'tier' }]);
  stub
    .intercept({ path: '/api/admin/projects', query: { view: 'core' }, method: 'GET' })
    .reply(200, { version: 1, projects: [{ id: 'web', name: 'Web' }] });
  stub
    .intercept({ path: '/api/admin/tag-types', method: 'GET' })
    .reply(200, { version: 1, tagTypes: [{ name: 'team' }] });
  stub
    .intercept({ path: '/api/admin/tags', method: 'GET' })
    .reply(200, { version: 1, tags: [{ type: 'team', value: 'payments' }] });
  const search = createSearch(unleash);

  const output = await search({
    queries: [
      { kind: 'segments', query: 'beta' },
      { kind: 'segments', query: 'beta' },
      { kind: 'context_fields' },
      { kind: 'projects' },
      { kind: 'tag_types' },
      { kind: 'tags' },
    ],
  });

  assert.deepEqual(output, {
    results: [
      { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] },
      {
        kind: 'segments',
        segments: [{ id: 1, name: 'Beta', createdAt: '2026-10-22T08:00:00.000Z', usedInProjects: 2, usedInFlags: 3 }],
      },
      { kind: 'context_fields', fields: [{ name: 'tier', usedInProjects: 0, usedInFlags: 0 }] },
      { kind: 'projects', projects: [{ id: 'web', name: 'Web' }] },
      { kind: 'tag_types', tagTypes: [{ name: 'team', valueCount: 0, usedInProjects: 0 }] },
      { kind: 'tags', tags: [{ type: 'team', value: 'payments' }] },
    ],
  });
});
