import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { searchFlagCreators } from './flagCreators.ts';

test('finds the creators matching a part of their name or email, paged, and tells how many match in all', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: '/api/admin/flag-creators', query: { q: 'a', offset: '1', limit: '1' }, method: 'GET' })
    .reply(200, {
      total: 3,
      flagCreators: [{ id: 7, name: 'Alice', username: 'alice' }],
    });

  const output = await searchFlagCreators(unleash, { kind: 'flag_creators', query: 'a', offset: 1, limit: 1 });

  assert.deepEqual(output, { kind: 'flag_creators', total: 3, creators: [{ id: 7, name: 'Alice' }] });
});

test('fails with the Unleash error when the creators cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: '/api/admin/flag-creators', query: { offset: '0', limit: '20' }, method: 'GET' })
    .reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchFlagCreators(unleash, { kind: 'flag_creators', offset: 0, limit: 20 });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});
