import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteProjectNamed } from '../../unleash/testSetup.ts';
import { createProject, updateProject } from './project.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./project.snapshot.json', import.meta.url).pathname);
const name = 'mcp-project';
const toUpdate = 'mcp-project-update';
const renamed = 'mcp-project-renamed';
const names = [name, toUpdate, renamed];
let updatedId = '';

before(async () => {
  for (const n of names) await deleteProjectNamed(admin, n);
  // Created by the user, not the admin: only its owner, which its creator becomes, may change a project.
  const created = await unleash.POST('/api/admin/projects', {
    body: { name: toUpdate, mode: 'open', defaultStickiness: 'default', environments: ['development'] },
  });
  updatedId = created.data?.id ?? '';
});
after(async () => {
  for (const n of names) await deleteProjectNamed(admin, n);
  await close();
});

test('creates a project with every setting, answering with the id Unleash picks', async () => {
  const output = await createProject(unleash, {
    kind: 'project',
    action: 'create',
    name,
    description: 'Created by the MCP server tests',
    mode: 'protected',
    defaultStickiness: 'userId',
    environments: ['development', 'production'],
    changeRequestEnvironments: [{ name: 'production', requiredApprovals: 2 }],
  });

  assert.ok(output.kind === 'applied');
  assert.equal(typeof output.id, 'string');
});

// Only Unleash's defaults match, so a left out setting missing from the request fails the test.
test("sends left out settings as Unleash's defaults", async () => {
  const { unleash, stub } = createStubbedClient();
  const defaulted = (body: string): boolean =>
    isDeepStrictEqual(JSON.parse(body), {
      name,
      mode: 'open',
      defaultStickiness: 'default',
      changeRequestEnvironments: [{ name: 'production', requiredApprovals: 1 }],
    });
  stub
    .intercept({ path: '/api/admin/projects', method: 'POST', body: defaulted })
    .reply(201, { id: 'mcp-project', name }, { headers: { 'content-type': 'application/json' } });

  const output = await createProject(unleash, {
    kind: 'project',
    action: 'create',
    name,
    changeRequestEnvironments: [{ name: 'production' }],
  });

  assert.deepEqual(output, { kind: 'applied', id: 'mcp-project' });
});

test('fails with the Unleash error when the project cannot be created', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'The project name must contain at least one non-whitespace character';
  stub.intercept({ path: '/api/admin/projects', method: 'POST' }).reply(400, unleashError('ValidationError', message));

  const output = await createProject(unleash, { kind: 'project', action: 'create', name: ' ' });

  assert.deepEqual(output, { kind: 'failed', status: 400, name: 'ValidationError', reasons: [message] });
});

test('changes every setting of a project', async () => {
  const output = await updateProject(unleash, {
    kind: 'project',
    action: 'update',
    id: updatedId,
    name: renamed,
    description: 'Changed by the MCP server tests',
    mode: 'protected',
    defaultStickiness: 'userId',
    environments: ['production'],
    changeRequestEnvironments: [{ name: 'production', enabled: true, requiredApprovals: 2 }],
  });

  assert.deepEqual(output, { kind: 'applied' });
});

const json = { headers: { 'content-type': 'application/json' } };
const overview = (environments: string[]) => ({ environments: environments.map((environment) => ({ environment })) });

test('writes only the environments that differ from the enabled ones', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/projects/mcp-project', method: 'PUT' }).reply(200, {});
  stub
    .intercept({ path: '/api/admin/projects/mcp-project/overview', method: 'GET' })
    .reply(200, overview(['development', 'staging']), json);
  stub
    .intercept({
      path: '/api/admin/projects/mcp-project/environments',
      method: 'POST',
      body: (body) => isDeepStrictEqual(JSON.parse(body), { environment: 'production' }),
    })
    .reply(200, {});
  stub.intercept({ path: '/api/admin/projects/mcp-project/environments/staging', method: 'DELETE' }).reply(200, {});

  const output = await updateProject(unleash, {
    kind: 'project',
    action: 'update',
    id: 'mcp-project',
    name,
    environments: ['development', 'production'],
  });

  assert.deepEqual(output, { kind: 'applied' });
});

// The stub has no overview, so reading the environments without being asked fails the test. Approvals left out are 1.
test('leaves environments alone when left out, turning change requests on and off as asked', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/projects/mcp-project', method: 'PUT' }).reply(200, {});
  stub
    .intercept({
      path: '/api/admin/projects/mcp-project/environments/production/change-requests/config',
      method: 'PUT',
      body: (body) => isDeepStrictEqual(JSON.parse(body), { changeRequestsEnabled: false }),
    })
    .reply(200, {});
  stub
    .intercept({
      path: '/api/admin/projects/mcp-project/environments/development/change-requests/config',
      method: 'PUT',
      body: (body) => isDeepStrictEqual(JSON.parse(body), { changeRequestsEnabled: true, requiredApprovals: 1 }),
    })
    .reply(200, {});

  const output = await updateProject(unleash, {
    kind: 'project',
    action: 'update',
    id: 'mcp-project',
    name,
    changeRequestEnvironments: [
      { name: 'production', enabled: false },
      { name: 'development', enabled: true },
    ],
  });

  assert.deepEqual(output, { kind: 'applied' });
});

// The stub answers nothing else, so a write after the refused one fails the test.
test('stops at the first write Unleash refuses, with its error', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'Could not find project with id mcp-project';
  stub
    .intercept({ path: '/api/admin/projects/mcp-project', method: 'PUT' })
    .reply(404, unleashError('NotFoundError', message));

  const output = await updateProject(unleash, {
    kind: 'project',
    action: 'update',
    id: 'mcp-project',
    name,
    environments: ['production'],
    changeRequestEnvironments: [{ name: 'production', enabled: true }],
  });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});
