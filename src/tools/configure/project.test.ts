import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteProjectNamed } from '../../unleash/testSetup.ts';
import { createProject } from './project.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./project.snapshot.json', import.meta.url).pathname);
const name = 'mcp-project';

before(() => deleteProjectNamed(admin, name));
after(async () => {
  await deleteProjectNamed(admin, name);
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
