import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { deleteFlag } from '../../../unleash/testSetup.ts';
import { searchFlagCreators } from './flagCreators.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./flagCreators.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-creator-flag';

// The user behind the token creates a flag, so it is a creator whatever else the sandbox holds.
before(async () => {
  await deleteFlag(admin, project, flag);
  await unleash.POST('/api/admin/projects/{projectId}/features', { params: { path: { projectId: project } }, body: { name: flag } });
});
after(async () => {
  await deleteFlag(admin, project, flag);
  await close();
});

test('finds the users who created a flag by the start of their email', async () => {
  const output = await searchFlagCreators(unleash, { kind: 'flag_creators', query: 'mateusz@getunleash.ai', offset: 0, limit: 20 });

  assert.partialDeepStrictEqual(output, { kind: 'flag_creators', total: 1, creators: [{ id: 17, name: 'Mateusz K' }] });
});

test('pages the creators and tells how many match in all', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/flag-creators', query: { q: 'a', offset: '1', limit: '1' }, method: 'GET' }).reply(200, {
    total: 3,
    flagCreators: [{ id: 7, name: 'Alice' }],
  });

  const output = await searchFlagCreators(unleash, { kind: 'flag_creators', query: 'a', offset: 1, limit: 1 });

  assert.deepEqual(output, { kind: 'flag_creators', total: 3, creators: [{ id: 7, name: 'Alice' }] });
});

test('fails with the Unleash error when the creators cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/flag-creators', query: { offset: '0', limit: '20' }, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchFlagCreators(unleash, { kind: 'flag_creators', offset: 0, limit: 20 });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
