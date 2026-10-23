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

// The recording replays by full request, so it pins each request's body: the type and description on the create,
// then the tag and the link on their own requests.
test('creates a flag with its type, description, tags and links', async () => {
  const outcome = await createFlag(unleash, {
    action: 'create',
    project,
    flag,
    type: 'kill-switch',
    description: 'Degrades checkout gracefully',
    tags: [{ type: 'simple', value: 'mcp-created' }],
    links: [{ url: 'https://github.com/Unleash/unleash-mcp/pull/1', title: 'Pull request' }],
  });

  assert.deepEqual(outcome, { kind: 'applied' });
});

// Only the create is stubbed, so any further request for a bare flag fails the test.
test('creates a bare flag in one request', async () => {
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

// The flag is created by then, so the failure leaves it without the tag.
test('fails with the Unleash error when the flag cannot be tagged', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'No tag type named "team" exists';
  stub.intercept({ path: '/api/admin/projects/web/features', method: 'POST' }).reply(201, { name: 'checkout' });
  stub.intercept({ path: '/api/admin/features/checkout/tags', method: 'PUT' }).reply(404, unleashError('NotFoundError', message));

  const outcome = await createFlag(unleash, { action: 'create', project: 'web', flag: 'checkout', tags: [{ type: 'team', value: 'payments' }] });

  assert.deepEqual(outcome, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});

// The flag is created by then, so the failure leaves it without the link.
test('fails with the Unleash error when a link cannot be added', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'Invalid URL';
  stub.intercept({ path: '/api/admin/projects/web/features', method: 'POST' }).reply(201, { name: 'checkout' });
  stub.intercept({ path: '/api/admin/projects/web/features/checkout/link', method: 'POST' }).reply(400, unleashError('BadDataError', message));

  const outcome = await createFlag(unleash, { action: 'create', project: 'web', flag: 'checkout', links: [{ url: 'not a url' }] });

  assert.deepEqual(outcome, { kind: 'failed', status: 400, name: 'BadDataError', reasons: [message] });
});

// Each stub answers once: skipping the second link, or going on after its failure, fails the test.
test('adds the links in order and stops at the first that fails', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'Invalid URL';
  stub.intercept({ path: '/api/admin/projects/web/features', method: 'POST' }).reply(201, { name: 'checkout' });
  stub.intercept({ path: '/api/admin/projects/web/features/checkout/link', method: 'POST' }).reply(204);
  stub.intercept({ path: '/api/admin/projects/web/features/checkout/link', method: 'POST' }).reply(400, unleashError('BadDataError', message));

  const outcome = await createFlag(unleash, {
    action: 'create', project: 'web', flag: 'checkout', links: [{ url: 'https://example.com/pr/1' }, { url: 'not a url' }, { url: 'https://example.com/pr/3' }],
  });

  assert.deepEqual(outcome, { kind: 'failed', status: 400, name: 'BadDataError', reasons: [message] });
});
