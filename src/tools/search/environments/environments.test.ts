import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { searchEnvironments } from './environments.ts';

const { unleash, admin, close } = createRecordedClient(
  new URL('./environments.snapshot.json', import.meta.url).pathname,
);
const deprecated = 'mcp-deprecated-production';

const deleteEnvironment = () =>
  admin.DELETE('/api/admin/environments/{name}', { params: { path: { name: deprecated } } });

before(async () => {
  await deleteEnvironment();
  const created = await admin.POST('/api/admin/environments', { body: { name: deprecated, type: 'production' } });
  assert(created.response.ok, String(created.response.status));
  const off = await admin.POST('/api/admin/environments/{name}/off', { params: { path: { name: deprecated } } });
  assert(off.response.ok, String(off.response.status));
});
after(close);

// The sandbox's environments are shared, so only two are asserted: the built-in production one and the one made here.
test('finds environments by a part of their name, case insensitive, with their type', async () => {
  const output = await searchEnvironments(unleash, { kind: 'environments', query: 'PRODUCTION' });

  assert(output.kind === 'environments');
  assert.deepEqual(
    output.environments.find((e) => e.name === 'production'),
    { name: 'production', type: 'production' },
  );
  assert.deepEqual(
    output.environments.find((e) => e.name === deprecated),
    { name: deprecated, type: 'production', deprecated: true },
  );
  assert(output.environments.every((e) => e.name.toLowerCase().includes('production')));
});

test('fails with the Unleash error when the environments cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: '/api/admin/environments', method: 'GET' })
    .reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchEnvironments(unleash, { kind: 'environments' });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});
