import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../unleash/testClient.ts';
import { pickProject } from './project.ts';

const projects = '/api/admin/projects?view=core';
const listing = (...ids: string[]) => ({ version: 1, projects: ids.map((id) => ({ id, name: id })) });

test('picks the requested project without asking Unleash', async () => {
  const { unleash } = createStubbedClient();

  const output = await pickProject(unleash, 'requested');

  assert.deepEqual(output, { kind: 'picked', project: 'requested' });
});

test('picks the only project when none is requested', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: projects, method: 'GET' }).reply(200, listing('only'));

  const output = await pickProject(unleash);

  assert.deepEqual(output, { kind: 'picked', project: 'only' });
});

test('asks which project when there are several', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: projects, method: 'GET' }).reply(200, listing('first', 'second'));

  const output = await pickProject(unleash);

  assert.deepEqual(output, { kind: 'choose', input: 'project', message: 'Which project?', options: ['first', 'second'] });
});

test('fails with the Unleash error when the projects cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'You must log in to use Unleash';
  stub.intercept({ path: projects, method: 'GET' }).reply(401, { name: 'AuthenticationRequired', message, details: [{ message }] });

  const output = await pickProject(unleash);

  assert.deepEqual(output, { kind: 'failed', status: 401, name: 'AuthenticationRequired', reasons: [message] });
});
