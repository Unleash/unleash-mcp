import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { createConfigure } from './configure.ts';

test('applies the changes after a failed one, naming the change each result answers', async () => {
  const { unleash, stub } = createStubbedClient();
  const taken = 'A context field with that name already exist';
  const missing = 'Could not find context field with name region';
  stub.intercept({ path: '/api/admin/context', method: 'POST' }).reply(409, unleashError('NameExistsError', taken));
  stub.intercept({ path: '/api/admin/context/region/legal-values/eu', method: 'DELETE' }).reply(404, unleashError('NotFoundError', missing));
  const configure = createConfigure(unleash);

  const output = await configure({ changes: [
    { kind: 'context_field', action: 'create', name: 'tier' },
    { kind: 'legal_value', action: 'delete', field: 'region', value: 'eu' },
  ] });

  assert.deepEqual(output, {
    results: [
      { kind: 'failed', resource: 'context_field', action: 'create', name: 'tier', error: { status: 409, name: 'NameExistsError', reasons: [taken] } },
      { kind: 'failed', resource: 'legal_value', action: 'delete', field: 'region', value: 'eu', error: { status: 404, name: 'NotFoundError', reasons: [missing] } },
    ],
  });
});

test('answers a created release template with its id', async () => {
  const { unleash, stub } = createStubbedClient();
  const id = '01JB9GGTGQYEQ9D40R17T3YVW2';
  stub.intercept({ path: '/api/admin/release-plan-templates', method: 'POST' })
    .reply(200, { id, discriminator: 'template', name: 'Gradual rollout', milestones: [] }, { headers: { 'content-type': 'application/json' } });
  const configure = createConfigure(unleash);

  const output = await configure({ changes: [
    { kind: 'release_template', action: 'create', name: 'Gradual rollout', milestones: [{ name: 'Everyone', targets: [{ name: 'Everyone' }] }] },
  ] });

  assert.deepEqual(output, { results: [{ kind: 'applied', resource: 'release_template', action: 'create', name: 'Gradual rollout', id }] });
});

test('answers a created segment with its id', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments', method: 'POST' })
    .reply(201, { id: 42, name: 'Beta testers', constraints: [] }, { headers: { 'content-type': 'application/json' } });
  const configure = createConfigure(unleash);

  const output = await configure({ changes: [{ kind: 'segment', action: 'create', name: 'Beta testers', constraints: [] }] });

  assert.deepEqual(output, { results: [{ kind: 'applied', resource: 'segment', action: 'create', name: 'Beta testers', id: 42 }] });
});

test('names an updated segment by its id', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments/42', method: 'PUT' }).reply(204, '');
  const configure = createConfigure(unleash);

  const output = await configure({ changes: [{ kind: 'segment', action: 'update', id: 42, name: 'Beta testers', constraints: [] }] });

  assert.deepEqual(output, { results: [{ kind: 'applied', resource: 'segment', action: 'update', id: 42, name: 'Beta testers' }] });
});

test('names a deleted segment by its id', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments/42', method: 'DELETE' }).reply(204, '');
  const configure = createConfigure(unleash);

  const output = await configure({ changes: [{ kind: 'segment', action: 'delete', id: 42 }] });

  assert.deepEqual(output, { results: [{ kind: 'applied', resource: 'segment', action: 'delete', id: 42 }] });
});

test('answers a change waiting for approval with its change request', async () => {
  const { unleash, stub } = createStubbedClient();
  const draft = { id: 7, state: 'In review', environment: 'production', project: 'mcp-server', minApprovals: 1, features: [], segments: [] };
  stub.intercept({ path: '/api/admin/ui-config', method: 'GET' }).reply(200, { environment: 'Enterprise', versionInfo: { current: { oss: '8.2.0', enterprise: '8.2.1' } } });
  stub.intercept({ path: '/api/admin/projects/mcp-server/change-requests/config', method: 'GET' })
    .reply(200, [{ environment: 'production', type: 'production', requiredApprovals: 1, changeRequestEnabled: true }]);
  stub.intercept({ path: '/api/admin/projects/mcp-server/environments/production/change-requests', method: 'POST' }).reply(200, draft);
  const configure = createConfigure(unleash);

  const output = await configure({ changes: [{ kind: 'segment', action: 'delete', id: 42, project: 'mcp-server' }] });

  assert.deepEqual(output, {
    results: [{ kind: 'pending_change_request', resource: 'segment', action: 'delete', id: 42, changeRequest: { id: 7, state: 'In review', url: 'https://unleash.example/projects/mcp-server/change-requests/7' } }],
  });
});

test('names the tag type and the tag a result answers', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/tag-types/team', method: 'PUT' }).reply(200, { version: 1, tagType: { name: 'team', description: '' } });
  stub.intercept({ path: '/api/admin/tags/team/payments', method: 'DELETE' }).reply(200);
  const configure = createConfigure(unleash);

  const output = await configure({ changes: [
    { kind: 'tag_type', action: 'update', name: 'team' },
    { kind: 'tag', action: 'delete', type: 'team', value: 'payments' },
  ] });

  assert.deepEqual(output, {
    results: [
      { kind: 'applied', resource: 'tag_type', action: 'update', name: 'team' },
      { kind: 'applied', resource: 'tag', action: 'delete', type: 'team', value: 'payments' },
    ],
  });
});
