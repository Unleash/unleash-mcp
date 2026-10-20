import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../unleash/testClient.ts';
import { pickEnvironment } from './environment.ts';

const project = 'mcp-server';
const environments = `/api/admin/environments/project/${project}`;
const listing = (enabled: string[], disabled: string[] = []) => ({
  version: 1,
  environments: [
    ...enabled.map((name) => ({ name, enabled: true })),
    ...disabled.map((name) => ({ name, enabled: false })),
  ],
});

test('picks the requested environment when it is enabled', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: environments, method: 'GET' }).reply(200, listing(['development', 'production']));

  const output = await pickEnvironment(unleash, project, 'production');

  assert.deepEqual(output, { kind: 'picked', environment: 'production' });
});

test('picks the only enabled environment when none is requested', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: environments, method: 'GET' }).reply(200, listing(['development'], ['production']));

  const output = await pickEnvironment(unleash, project);

  assert.deepEqual(output, { kind: 'picked', environment: 'development' });
});

test('asks which environment when several are enabled', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: environments, method: 'GET' }).reply(200, listing(['development', 'production']));

  const output = await pickEnvironment(unleash, project);

  assert.deepEqual(output, { kind: 'choose', input: 'environment', message: 'Which environment?', options: ['development', 'production'] });
});

test('asks again when the requested environment is not enabled', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: environments, method: 'GET' }).reply(200, listing(['development'], ['production']));

  const output = await pickEnvironment(unleash, project, 'production');

  assert.deepEqual(output, {
    kind: 'choose',
    input: 'environment',
    message: `Environment "production" is not enabled in project ${project}. Which environment?`,
    options: ['development'],
  });
});

test('fails with the Unleash error when the environments cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'You must log in to use Unleash';
  stub.intercept({ path: environments, method: 'GET' }).reply(401, { name: 'AuthenticationRequired', message, details: [{ message }] });

  const output = await pickEnvironment(unleash, project);

  assert.deepEqual(output, { kind: 'failed', status: 401, name: 'AuthenticationRequired', reasons: [message] });
});
