import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUnleashClient } from './client.ts';

test('sends requests to the Unleash API with the configured auth headers', async () => {
  const requests: Request[] = [];
  const client = createUnleashClient({
    baseUrl: 'https://unleash.example/base',
    headers: { Authorization: 'user:token' },
    fetch: async (request) => {
      requests.push(request as Request);
      return Response.json({ version: 1, projects: [] });
    },
  });

  const { data } = await client.GET('/api/admin/projects');

  assert.deepEqual(data, { version: 1, projects: [] });
  assert.equal(requests[0]?.url, 'https://unleash.example/base/api/admin/projects');
  assert.equal(requests[0]?.headers.get('authorization'), 'user:token');
});
