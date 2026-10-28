import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import type { Interceptable } from 'undici';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteFlag } from '../../unleash/testSetup.ts';
import { defineFlag } from './define.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./define.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-defined-flag';
const tags = [{ type: 'simple', value: 'mcp-defined' }];
const pullRequest = { url: 'https://github.com/Unleash/unleash-mcp/pull/1', title: 'Pull request' };

before(async () => {
  await deleteFlag(admin, project, flag);
});
after(async () => {
  await deleteFlag(admin, project, flag);
  await close();
});

// The recording replays by full request, so it pins each request's body: the type and description on the create,
// then the tag and the link on their own requests.
test('creates a missing flag with its type, description, tags and links', async () => {
  const outcome = await defineFlag(unleash, {
    action: 'define',
    project,
    flag,
    type: 'kill-switch',
    description: 'Degrades checkout gracefully',
    tags,
    links: [pullRequest],
  });

  assert.deepEqual(outcome, { kind: 'applied', status: 'new', changed: ['tags', 'links'] });
});

// Runs after the create and lists other tags and links: the recording pins the tag swap in one request, and the
// removal of the first link next to the posting of the second. The type is left out, so the current type goes back with the description.
test('changes an existing flag to what is listed and leaves out what is not', async () => {
  const outcome = await defineFlag(unleash, {
    action: 'define',
    project,
    flag,
    description: 'Degrades checkout and payments gracefully',
    tags: [{ type: 'simple', value: 'mcp-redefined' }],
    links: [{ url: 'https://example.com/ticket/42' }],
  });

  assert.deepEqual(outcome, { kind: 'applied', status: 'existing', changed: ['description', 'tags', 'links'] });
});

const web = '/api/admin/projects/web/features';
const checkout = `${web}/checkout`;
const existing = {
  name: 'checkout',
  project: 'web',
  type: 'release',
  description: 'Checkout',
  stale: false,
  impressionData: false,
  links: [{ id: 'l1', url: 'https://example.com/pr/1' }],
};
const stubMissing = (stub: Interceptable) =>
  stub
    .intercept({ path: checkout, method: 'GET' })
    .reply(404, unleashError('NotFoundError', 'No feature named checkout'));
const stubExisting = (stub: Interceptable) => stub.intercept({ path: checkout, method: 'GET' }).reply(200, existing);

// Only the read is stubbed, so any write for a flag that already matches fails the test.
test('writes nothing when an existing flag already has what is listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stubExisting(stub);

  const outcome = await defineFlag(unleash, {
    action: 'define',
    project: 'web',
    flag: 'checkout',
    type: 'release',
    description: 'Checkout',
    links: [{ url: 'https://example.com/pr/1' }],
  });

  assert.deepEqual(outcome, { kind: 'applied', status: 'existing', changed: [] });
});

// Only the exact body matches: the description must come back with the new type, or Unleash would clear it.
test('changes the type of an existing flag without losing its description', async () => {
  const { unleash, stub } = createStubbedClient();
  stubExisting(stub);
  const keepsDescription = (body: string): boolean =>
    isDeepStrictEqual(JSON.parse(body), {
      type: 'kill-switch',
      description: 'Checkout',
      stale: false,
      impressionData: false,
    });
  stub
    .intercept({ path: checkout, method: 'PUT', body: keepsDescription })
    .reply(200, { ...existing, type: 'kill-switch' });

  const outcome = await defineFlag(unleash, {
    action: 'define',
    project: 'web',
    flag: 'checkout',
    type: 'kill-switch',
  });

  assert.deepEqual(outcome, { kind: 'applied', status: 'existing', changed: ['type'] });
});

// Only the exact body matches: one request adds the missing tag and removes the unlisted one, keeping the rest.
test('adds and removes tags so an existing flag has exactly those listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stubExisting(stub);
  stub.intercept({ path: '/api/admin/features/checkout/tags', method: 'GET' }).reply(200, {
    version: 1,
    tags: [
      { type: 'simple', value: 'web' },
      { type: 'simple', value: 'legacy' },
    ],
  });
  const swap = (body: string): boolean =>
    isDeepStrictEqual(JSON.parse(body), {
      addedTags: [{ type: 'team', value: 'payments' }],
      removedTags: [{ type: 'simple', value: 'legacy' }],
    });
  stub.intercept({ path: '/api/admin/features/checkout/tags', method: 'PUT', body: swap }).reply(200);

  const outcome = await defineFlag(unleash, {
    action: 'define',
    project: 'web',
    flag: 'checkout',
    tags: [
      { type: 'simple', value: 'web' },
      { type: 'team', value: 'payments' },
    ],
  });

  assert.deepEqual(outcome, { kind: 'applied', status: 'existing', changed: ['tags'] });
});

// Only the read and the delete are stubbed, so posting the link the flag keeps fails the test.
test('removes the links an existing flag has beyond those listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: checkout, method: 'GET' })
    .reply(200, { ...existing, links: [...existing.links, { id: 'l2', url: 'https://example.com/old' }] });
  stub.intercept({ path: `${checkout}/link/l2`, method: 'DELETE' }).reply(204);

  const outcome = await defineFlag(unleash, {
    action: 'define',
    project: 'web',
    flag: 'checkout',
    links: [{ url: 'https://example.com/pr/1' }],
  });

  assert.deepEqual(outcome, { kind: 'applied', status: 'existing', changed: ['links'] });
});

test('fails with the Unleash error when the flag cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'You need the READ_PROJECT permission';
  stub.intercept({ path: checkout, method: 'GET' }).reply(403, unleashError('PermissionError', message));

  const outcome = await defineFlag(unleash, { action: 'define', project: 'web', flag: 'checkout' });

  assert.deepEqual(outcome, { kind: 'failed', status: 403, name: 'PermissionError', reasons: [message] });
});

// Each stub answers once: skipping the second link, or going on after its failure, fails the test.
test('adds the links in order and stops at the first that fails', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'Invalid URL';
  stubMissing(stub);
  stub.intercept({ path: web, method: 'POST' }).reply(201, { name: 'checkout' });
  const first = (body: string): boolean => isDeepStrictEqual(JSON.parse(body), { url: 'https://example.com/pr/1' });
  const second = (body: string): boolean => isDeepStrictEqual(JSON.parse(body), { url: 'not a url' });
  stub.intercept({ path: `${checkout}/link`, method: 'POST', body: first }).reply(204);
  stub
    .intercept({ path: `${checkout}/link`, method: 'POST', body: second })
    .reply(400, unleashError('BadDataError', message));

  const outcome = await defineFlag(unleash, {
    action: 'define',
    project: 'web',
    flag: 'checkout',
    links: [{ url: 'https://example.com/pr/1' }, { url: 'not a url' }, { url: 'https://example.com/pr/3' }],
  });

  assert.deepEqual(outcome, { kind: 'failed', status: 400, name: 'BadDataError', reasons: [message] });
});
