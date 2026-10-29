import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { createInspect } from './inspect.ts';

// What each query returns is pinned by its own step's tests; here only the order and the inline failures matter.
test('answers each query in the order asked, failures included', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: '/api/admin/projects/unknown/overview', method: 'GET' })
    .reply(404, unleashError('NotFoundError', 'No project found'));
  stub.intercept({ path: '/api/admin/projects/known/overview', method: 'GET' }).reply(200, {
    name: 'Known',
    mode: 'open',
    environments: [{ environment: 'development' }],
    defaultStickiness: 'userId',
  });
  stub
    .intercept({ path: '/api/admin/projects/known/features/mcp-flag', method: 'GET' })
    .reply(200, { name: 'mcp-flag', type: 'release' });
  stub.intercept({ path: '/api/admin/features/mcp-flag/tags', method: 'GET' }).reply(200, { version: 1, tags: [] });
  // Open source, so the flag query reads no change requests.
  stub
    .intercept({ path: '/api/admin/ui-config', method: 'GET' })
    .reply(200, { versionInfo: { current: { oss: '8.2.0', enterprise: '' } } });
  stub.intercept({ path: '/api/admin/context/tier', method: 'GET' }).reply(200, { name: 'tier', stickiness: true });
  stub
    .intercept({ path: '/api/admin/segments/7', method: 'GET' })
    .reply(200, { id: 7, name: 'Beta', constraints: [], createdAt: '2026-10-22T08:00:00.000Z' });
  const inspect = createInspect(unleash);

  const output = await inspect({
    queries: [
      { kind: 'project', project: 'unknown' },
      { kind: 'project', project: 'known' },
      { kind: 'flag', project: 'known', flag: 'mcp-flag' },
      { kind: 'context_field', name: 'tier' },
      { kind: 'segment', id: 7 },
    ],
  });

  assert.deepEqual(output, {
    results: [
      { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['No project found'] },
      { kind: 'project', name: 'Known', mode: 'open', environments: ['development'], defaultStickiness: 'userId' },
      { kind: 'flag', name: 'mcp-flag', type: 'release', environments: [] },
      { kind: 'context_field', name: 'tier', stickiness: true },
      { kind: 'segment', id: 7, name: 'Beta', constraints: [], createdAt: '2026-10-22T08:00:00.000Z' },
    ],
  });
});
