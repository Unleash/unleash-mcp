import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../unleash/testClient.ts';
import { pickSegments } from './segment.ts';

const project = 'mcp-server';
const segments = '/api/admin/segments';
const listing = {
  segments: [
    { id: 1, name: 'internal-beta', constraints: [] },
    { id: 2, name: 'enterprise', project, constraints: [] },
    { id: 3, name: 'elsewhere', project: 'other-project', constraints: [] },
  ],
};

// No intercept: a request would fail the test.
test('picks no segments without asking Unleash when none are named', async () => {
  const { unleash } = createStubbedClient();

  const output = await pickSegments(unleash, project, []);

  assert.deepEqual(output, { kind: 'picked', ids: new Map() });
});

test('picks global and project segments by name', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: segments, method: 'GET' }).reply(200, listing);

  const output = await pickSegments(unleash, project, ['internal-beta', 'enterprise']);

  assert.deepEqual(output, { kind: 'picked', ids: new Map([['internal-beta', 1], ['enterprise', 2]]) });
});

test('asks which segments when one belongs to another project', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: segments, method: 'GET' }).reply(200, listing);

  const output = await pickSegments(unleash, project, ['elsewhere']);

  assert.deepEqual(output, {
    kind: 'choose',
    input: 'segments',
    message: `Segment "elsewhere" not found in project ${project}. Which segments?`,
    options: ['internal-beta', 'enterprise'],
  });
});

test('asks once for every unknown segment', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: segments, method: 'GET' }).reply(200, listing);

  const output = await pickSegments(unleash, project, ['nope', 'internal-beta', 'gone', 'nope']);

  assert.deepEqual(output, {
    kind: 'choose',
    input: 'segments',
    message: `Segments "nope", "gone" not found in project ${project}. Which segments?`,
    options: ['internal-beta', 'enterprise'],
  });
});

test('fails with the Unleash error when the segments cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'You must log in to use Unleash';
  stub.intercept({ path: segments, method: 'GET' }).reply(401, { name: 'AuthenticationRequired', message, details: [{ message }] });

  const output = await pickSegments(unleash, project, ['internal-beta']);

  assert.deepEqual(output, { kind: 'failed', status: 401, name: 'AuthenticationRequired', reasons: [message] });
});
