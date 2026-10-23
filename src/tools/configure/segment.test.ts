import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteSegmentNamed } from '../../unleash/testSetup.ts';
import { createSegment, deleteSegment, updateSegment } from './segment.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./segment.snapshot.json', import.meta.url).pathname);
const name = 'mcp-configured-segment';
const projectSegment = 'mcp-configured-project-segment';
const updatable = 'mcp-updatable-segment';
const updated = 'mcp-updated-segment';
const deletable = 'mcp-deletable-segment';
const project = 'mcp-server';

const deleteSegments = async (): Promise<void> => {
  for (const segment of [name, projectSegment, updatable, updated, deletable]) await deleteSegmentNamed(admin, segment);
};

before(deleteSegments);
after(async () => {
  await deleteSegments();
  await close();
});

test('creates a segment with its constraints, answering with its id', async () => {
  const output = await createSegment(unleash, {
    kind: 'segment',
    action: 'create',
    name,
    description: 'Created by the MCP server tests',
    constraints: [{ field: 'email', operator: 'STR_ENDS_WITH', values: ['@getunleash.io'] }],
  });

  assert.equal(output.kind, 'applied');
  assert.equal(typeof output.id, 'number');
});

test('creates a segment in a project', async () => {
  const output = await createSegment(unleash, { kind: 'segment', action: 'create', project, name: projectSegment, constraints: [] });

  assert.equal(output.kind, 'applied');
});

test('fails with the Unleash error when the segment name is taken', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = `There already exists a segment named ${name}`;
  stub.intercept({ path: '/api/admin/segments', method: 'POST' }).reply(409, unleashError('NameExistsError', message));

  const output = await createSegment(unleash, { kind: 'segment', action: 'create', name, constraints: [] });

  assert.deepEqual(output, { kind: 'failed', status: 409, name: 'NameExistsError', reasons: [message] });
});

test('replaces a segment', async () => {
  const id = (await admin.POST('/api/admin/segments', { body: { name: updatable, constraints: [] } })).data?.id ?? 0;

  const output = await updateSegment(unleash, {
    kind: 'segment',
    action: 'update',
    id,
    name: updated,
    constraints: [{ field: 'userId', operator: 'IN', values: ['1', '2'] }],
  });

  assert.deepEqual(output, { kind: 'applied' });
});

test('fails with the Unleash error when the segment to update does not exist', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'No segment exists with id 404';
  stub.intercept({ path: '/api/admin/segments/404', method: 'PUT' }).reply(404, unleashError('NotFoundError', message));

  const output = await updateSegment(unleash, { kind: 'segment', action: 'update', id: 404, name, constraints: [] });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});

test('deletes a segment', async () => {
  const id = (await admin.POST('/api/admin/segments', { body: { name: deletable, constraints: [] } })).data?.id ?? 0;

  const output = await deleteSegment(unleash, { kind: 'segment', action: 'delete', id });

  assert.deepEqual(output, { kind: 'applied' });
});

test('fails with a reason when a flag still targets the segment, which Unleash leaves out', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments/42', method: 'DELETE' }).reply(409, '');

  const output = await deleteSegment(unleash, { kind: 'segment', action: 'delete', id: 42 });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 409,
    name: 'ConflictError',
    reasons: ['A flag still targets the segment; inspect the segment with usage to find which'],
  });
});
