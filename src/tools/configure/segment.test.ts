import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { production, stubChangeRequestsIn } from '../../unleash/testChangeRequest.ts';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { cancelChangeRequest, deleteSegmentNamed } from '../../unleash/testSetup.ts';
import { createChangeRequestReader } from '../shared/changeRequest.ts';
import { createSegment, deleteSegment, updateSegment } from './segment.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./segment.snapshot.json', import.meta.url).pathname);
const environmentsOf = createChangeRequestReader(unleash);
const name = 'mcp-configured-segment';
const projectSegment = 'mcp-configured-project-segment';
const updatable = 'mcp-updatable-segment';
const updated = 'mcp-updated-segment';
const deletable = 'mcp-deletable-segment';
const reviewed = 'mcp-reviewed-segment';
const reviewedDeletion = 'mcp-reviewed-deletion-segment';
const project = 'mcp-server';
// Unleash adds a change to the user's open change request, in review or not, so both tests can answer the same one.
const changeRequestIds = new Set<number>();

const deleteSegments = async (): Promise<void> => {
  for (const segment of [name, projectSegment, updatable, updated, deletable, reviewed, reviewedDeletion])
    await deleteSegmentNamed(admin, segment);
};

before(deleteSegments);
// The change requests go first, so nothing pending refers to the segments.
after(async () => {
  for (const id of changeRequestIds) await cancelChangeRequest(unleash, project, id);
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
  const output = await createSegment(unleash, {
    kind: 'segment',
    action: 'create',
    project,
    name: projectSegment,
    constraints: [],
  });

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

  const output = await updateSegment(unleash, environmentsOf, {
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

  const output = await updateSegment(unleash, environmentsOf, {
    kind: 'segment',
    action: 'update',
    id: 404,
    name,
    constraints: [],
  });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});

test('deletes a segment', async () => {
  const id = (await admin.POST('/api/admin/segments', { body: { name: deletable, constraints: [] } })).data?.id ?? 0;

  const output = await deleteSegment(unleash, environmentsOf, { kind: 'segment', action: 'delete', id });

  assert.deepEqual(output, { kind: 'applied' });
});

test('fails with a reason when a flag still targets the segment, which Unleash leaves out', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments/42', method: 'DELETE' }).reply(409, '');

  const output = await deleteSegment(unleash, environmentsOf, { kind: 'segment', action: 'delete', id: 42 });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 409,
    name: 'ConflictError',
    reasons: ['A flag still targets the segment; inspect the segment with usage to find which'],
  });
});

// `mcp-server` requires change requests in production.
test('puts the update of a segment in a change request where the project requires one', async () => {
  const id =
    (await admin.POST('/api/admin/segments', { body: { name: reviewed, project, constraints: [] } })).data?.id ?? 0;

  const output = await updateSegment(unleash, environmentsOf, {
    kind: 'segment',
    action: 'update',
    id,
    project,
    name: reviewed,
    constraints: [],
  });

  assert(output.kind === 'pending_change_request');
  changeRequestIds.add(output.changeRequest.id);
  assert.equal(output.changeRequest.state, 'In review');
});

test('puts the deletion of a segment in a change request where the project requires one', async () => {
  const id =
    (await admin.POST('/api/admin/segments', { body: { name: reviewedDeletion, project, constraints: [] } })).data
      ?.id ?? 0;

  const output = await deleteSegment(unleash, environmentsOf, { kind: 'segment', action: 'delete', id, project });

  assert(output.kind === 'pending_change_request');
  changeRequestIds.add(output.changeRequest.id);
  assert.equal(output.changeRequest.state, 'In review');
});

const draft = {
  id: 7,
  state: 'Draft',
  environment: 'production',
  project,
  minApprovals: 1,
  features: [],
  segments: [],
};

test('replaces a project segment directly where the project requires no change requests', async () => {
  const { unleash, stub } = createStubbedClient();
  stubChangeRequestsIn(stub, project);
  stub.intercept({ path: '/api/admin/segments/42', method: 'PUT' }).reply(204, '');

  const output = await updateSegment(unleash, createChangeRequestReader(unleash), {
    kind: 'segment',
    action: 'update',
    id: 42,
    project,
    name,
    constraints: [],
  });

  assert.deepEqual(output, { kind: 'applied' });
});

// Only the production environment's change requests are stubbed, so opening one elsewhere fails the test.
test('opens the change request in a production environment first, as the Unleash UI does', async () => {
  const { unleash, stub } = createStubbedClient();
  stubChangeRequestsIn(
    stub,
    project,
    { environment: 'development', type: 'development' },
    { environment: 'live', type: 'production' },
  );
  const deletes = (body: string): boolean =>
    isDeepStrictEqual(JSON.parse(body), { action: 'deleteSegment', payload: { id: 42 } });
  stub
    .intercept({
      path: `/api/admin/projects/${project}/environments/live/change-requests`,
      method: 'POST',
      body: deletes,
    })
    .reply(200, draft);
  stub
    .intercept({ path: `/api/admin/projects/${project}/change-requests/7/state`, method: 'PUT' })
    .reply(200, { ...draft, state: 'In review' });

  const output = await deleteSegment(unleash, createChangeRequestReader(unleash), {
    kind: 'segment',
    action: 'delete',
    id: 42,
    project,
  });

  assert.partialDeepStrictEqual(output, { kind: 'pending_change_request', changeRequest: { id: 7 } });
});

test('fails with the Unleash error when the change request cannot be opened', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'You need the UPDATE_PROJECT_SEGMENT permission';
  stubChangeRequestsIn(stub, project, production);
  stub
    .intercept({ path: `/api/admin/projects/${project}/environments/production/change-requests`, method: 'POST' })
    .reply(403, unleashError('PermissionError', message));

  const output = await updateSegment(unleash, createChangeRequestReader(unleash), {
    kind: 'segment',
    action: 'update',
    id: 42,
    project,
    name,
    constraints: [],
  });

  assert.deepEqual(output, { kind: 'failed', status: 403, name: 'PermissionError', reasons: [message] });
});
