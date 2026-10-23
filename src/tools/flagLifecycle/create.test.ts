import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteFlag } from '../../unleash/testSetup.ts';
import { createFlag } from './create.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./create.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-created-flag';

before(async () => {
  await deleteFlag(admin, project, flag);
});
after(async () => {
  await deleteFlag(admin, project, flag);
  await close();
});

// The recording replays by full request, so it pins the type and the description on the create, and the tag on the second request.
test('creates a flag with its type, description and tags', async () => {
  const outcome = await createFlag(unleash, {
    action: 'create', project, flag, type: 'kill-switch', description: 'Degrades checkout gracefully', tags: [{ type: 'simple', value: 'mcp-created' }],
  });

  assert.deepEqual(outcome, { kind: 'applied' });
});

// Only the create is stubbed, so a tag request for a flag without tags fails the test.
test('creates a flag without tags in one request', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/projects/web/features', method: 'POST' }).reply(201, { name: 'checkout' });

  const outcome = await createFlag(unleash, { action: 'create', project: 'web', flag: 'checkout' });

  assert.deepEqual(outcome, { kind: 'applied' });
});

test('fails with the Unleash error when the flag cannot be created', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'A feature flag with that name already exists';
  stub.intercept({ path: '/api/admin/projects/web/features', method: 'POST' }).reply(409, unleashError('NameExistsError', message));

  const outcome = await createFlag(unleash, { action: 'create', project: 'web', flag: 'checkout' });

  assert.deepEqual(outcome, { kind: 'failed', status: 409, name: 'NameExistsError', reasons: [message] });
});

// The flag is created by then: the failure tells the agent the tagging is what did not happen.
test('fails with the Unleash error when the flag cannot be tagged', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'No tag type named "team" exists';
  stub.intercept({ path: '/api/admin/projects/web/features', method: 'POST' }).reply(201, { name: 'checkout' });
  stub.intercept({ path: '/api/admin/features/checkout/tags', method: 'PUT' }).reply(404, unleashError('NotFoundError', message));

  const outcome = await createFlag(unleash, { action: 'create', project: 'web', flag: 'checkout', tags: [{ type: 'team', value: 'payments' }] });

  assert.deepEqual(outcome, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});
