import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient } from '../../../unleash/testClient.ts';
import { applied, createProjectNamed, deleteReleaseTemplate } from '../../../unleash/testSetup.ts';
import { createReleaseTemplate } from '../../configure/releaseTemplate.ts';
import { inspectReleaseTemplate } from './releaseTemplate.ts';

const { unleash, admin, close } = createRecordedClient(
  new URL('./releaseTemplate.snapshot.json', import.meta.url).pathname,
);
const project = 'mcp-inspect-release-template';
const global = 'mcp-inspected-template';
const projectScoped = 'mcp-inspected-project-template';
const beta = { field: 'userId', operator: 'IN' as const, values: ['1', '2'] };
let globalId = '';
let projectScopedId = '';

const cleanUp = async () => {
  await deleteReleaseTemplate(admin, global);
  await deleteReleaseTemplate(admin, projectScoped, project);
};

before(async () => {
  await createProjectNamed(admin, unleash, project);
  await cleanUp();
  const createdGlobal = await createReleaseTemplate(admin, {
    kind: 'release_template',
    action: 'create',
    name: global,
    description: 'Beta first, then everyone',
    milestones: [
      { name: 'Beta', targets: [{ name: 'Beta testers', constraints: [beta] }], advance: { afterMinutes: 60 } },
      { name: 'Everyone', targets: [{ name: 'Everyone' }] },
    ],
  });
  globalId = String(applied(createdGlobal).id);
  const createdProjectScoped = await createReleaseTemplate(admin, {
    kind: 'release_template',
    action: 'create',
    project,
    name: projectScoped,
    milestones: [{ name: 'Half', targets: [{ name: 'Half' }] }],
  });
  projectScopedId = String(applied(createdProjectScoped).id);
});
// The templates go in `after`: the sandbox caps them.
after(async () => {
  await cleanUp();
  await close();
});

test('describes a template by its milestones and when each moves on, leaving their targets out', async () => {
  const output = await inspectReleaseTemplate(unleash, { kind: 'release_template', id: globalId });

  assert.deepEqual(output, {
    kind: 'release_template',
    id: globalId,
    name: global,
    description: 'Beta first, then everyone',
    milestones: [{ name: 'Beta', transition: { type: 'time', intervalMinutes: 60 } }, { name: 'Everyone' }],
  });
});

test('lists the targets of each milestone when included, without a rollout group until applied to a flag', async () => {
  const output = await inspectReleaseTemplate(unleash, {
    kind: 'release_template',
    id: globalId,
    include: ['targets'],
  });

  assert(output.kind === 'release_template');
  assert.deepEqual(output.milestones, [
    {
      name: 'Beta',
      transition: { type: 'time', intervalMinutes: 60 },
      targets: [{ name: 'Beta testers', rollout: 100, stickiness: 'default', constraints: [beta] }],
    },
    { name: 'Everyone', targets: [{ name: 'Everyone', rollout: 100, stickiness: 'default' }] },
  ]);
});

test('names the project of a project template', async () => {
  const output = await inspectReleaseTemplate(unleash, { kind: 'release_template', id: projectScopedId });

  assert.deepEqual(output, {
    kind: 'release_template',
    id: projectScopedId,
    name: projectScoped,
    project,
    milestones: [{ name: 'Half' }],
  });
});

test('fails with the Unleash error when the template does not exist', async () => {
  const missing = '01M6JTP2KVAF1ZSCY05PEYX9PK';

  const output = await inspectReleaseTemplate(unleash, { kind: 'release_template', id: missing });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 404,
    name: 'NotFoundError',
    reasons: [`Could not find template with id ${missing}`],
  });
});
