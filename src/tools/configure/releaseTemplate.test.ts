import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteReleaseTemplate } from '../../unleash/testSetup.ts';
import { createReleaseTemplate } from './releaseTemplate.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./releaseTemplate.snapshot.json', import.meta.url).pathname);
const name = 'mcp-release-template';
const ulid = /^[0-9A-Z]{26}$/;

before(() => deleteReleaseTemplate(admin, name));
after(async () => {
  await deleteReleaseTemplate(admin, name);
  await close();
});

test('creates a release template whose milestones advance on their own, answering with its id', async () => {
  const output = await createReleaseTemplate(unleash, {
    kind: 'release_template',
    action: 'create',
    name,
    description: 'Created by the MCP server tests',
    milestones: [
      {
        name: 'Internal',
        targets: [{ name: 'Employees', constraints: [{ field: 'email', operator: 'STR_ENDS_WITH', values: ['@getunleash.io'] }], values: [{ name: 'new' }] }],
        advance: { afterMinutes: 60 },
      },
      { name: 'Half', targets: [{ name: 'Everyone', rollout: 50 }], advance: { afterExposures: 1000 } },
      { name: 'Everyone', targets: [{ name: 'Everyone' }] },
    ],
  });

  assert.ok(output.kind === 'applied');
  assert.match(output.id ?? '', ulid);
});

// Stubbed, not recorded: the sandbox's limit of 10 release templates leaves no room for a second one.
test('creates a release template in a project', async () => {
  const { unleash, stub } = createStubbedClient();
  const id = '01JB9GGTGQYEQ9D40R17T3YVW2';
  stub.intercept({ path: '/api/admin/projects/mcp-server/release-templates', method: 'POST' })
    .reply(200, { id, discriminator: 'template', name, project: 'mcp-server', milestones: [] }, { headers: { 'content-type': 'application/json' } });

  const output = await createReleaseTemplate(unleash, {
    kind: 'release_template',
    action: 'create',
    project: 'mcp-server',
    name,
    milestones: [{ name: 'Everyone', targets: [{ name: 'Everyone' }] }],
  });

  assert.deepEqual(output, { kind: 'applied', id });
});

test('fails with the Unleash error when the name is taken', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = `A release template with name ${name} already exists`;
  stub.intercept({ path: '/api/admin/release-plan-templates', method: 'POST' }).reply(409, unleashError('NameExistsError', message));

  const output = await createReleaseTemplate(unleash, {
    kind: 'release_template',
    action: 'create',
    name,
    milestones: [{ name: 'Everyone', targets: [{ name: 'Everyone' }] }],
  });

  assert.deepEqual(output, { kind: 'failed', status: 409, name: 'NameExistsError', reasons: [message] });
});
