import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { applied, createProjectNamed, deleteProjectNamed, deleteReleaseTemplate } from '../../../unleash/testSetup.ts';
import { createReleaseTemplate } from '../../configure/releaseTemplate.ts';
import { searchReleaseTemplates } from './releaseTemplates.ts';

const { unleash, admin, close } = createRecordedClient(
  new URL('./releaseTemplates.snapshot.json', import.meta.url).pathname,
);
const project = 'mcp-search-release-templates';
const global = 'mcp-searched-template';
const projectScoped = 'mcp-searched-project-template';
const archived = 'mcp-searched-archived-template';
const milestones = [{ name: 'Everyone', targets: [{ name: 'Everyone' }] }];
let globalId = '';
let projectScopedId = '';
let archivedId = '';

const cleanUp = async () => {
  await deleteReleaseTemplate(admin, global);
  await deleteReleaseTemplate(admin, archived);
  await deleteReleaseTemplate(admin, projectScoped, project);
};

before(async () => {
  await createProjectNamed(admin, unleash, project);
  await cleanUp();
  const createdGlobal = await createReleaseTemplate(admin, {
    kind: 'release_template',
    action: 'create',
    name: global,
    milestones,
  });
  globalId = String(applied(createdGlobal).id);
  const createdProjectScoped = await createReleaseTemplate(admin, {
    kind: 'release_template',
    action: 'create',
    project,
    name: projectScoped,
    milestones,
  });
  projectScopedId = String(applied(createdProjectScoped).id);
  const createdArchived = await createReleaseTemplate(admin, {
    kind: 'release_template',
    action: 'create',
    name: archived,
    milestones,
  });
  archivedId = String(applied(createdArchived).id);
  const archivedTemplate = await admin.POST('/api/admin/release-plan-templates/archive/{templateId}', {
    params: { path: { templateId: archivedId } },
  });
  assert(archivedTemplate.response.ok, String(archivedTemplate.response.status));
});
// Unleash leaves archived templates out of its lists, so the archived one is deleted by its id.
after(async () => {
  await cleanUp();
  const deletedTemplate = await admin.DELETE('/api/admin/release-plan-templates/{templateId}', {
    params: { path: { templateId: archivedId } },
  });
  assert(deletedTemplate.response.ok, String(deletedTemplate.response.status));
  await deleteProjectNamed(admin, project);
  await close();
});

test('finds global templates by a part of their name, case insensitive, with only what release takes', async () => {
  const output = await searchReleaseTemplates(unleash, { kind: 'release_templates', query: 'MCP-SEARCHED' });

  assert.deepEqual(output, { kind: 'release_templates', templates: [{ id: globalId, name: global }] });
});

test('keeps the templates usable in a project: its own and the global ones', async () => {
  const output = await searchReleaseTemplates(unleash, { kind: 'release_templates', project, query: 'mcp-searched' });

  assert(output.kind === 'release_templates');
  assert.deepEqual(
    new Set(output.templates),
    new Set([
      { id: projectScopedId, name: projectScoped },
      { id: globalId, name: global },
    ]),
  );
});

test('leaves out archived templates, as Unleash does', async () => {
  const output = await searchReleaseTemplates(unleash, { kind: 'release_templates', query: archived });

  assert.deepEqual(output, { kind: 'release_templates', templates: [] });
});

test('fails with the Unleash error when the templates cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: '/api/admin/release-plan-templates', method: 'GET' })
    .reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchReleaseTemplates(unleash, { kind: 'release_templates' });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});
