import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { deleteFlag, deleteSegmentNamed } from '../../../unleash/testSetup.ts';
import { inspectSegment } from './segment.ts';
import { createRelease } from '../../release/release.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./segment.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const segment = 'mcp-inspected-segment';
const flag = 'mcp-segment-flag';
const beta = { field: 'userId', operator: 'IN' as const, values: ['1', '2'] };
let id = 0;

// The flag goes first: Unleash may refuse to delete a segment in use. Two targets on the segment in one environment show as one use.
// The spec requires `caseInsensitive` and `inverted` on a segment constraint.
before(async () => {
  await deleteFlag(admin, project, flag);
  await deleteSegmentNamed(admin, segment);
  const created = await admin.POST('/api/admin/segments', { body: { name: segment, description: 'Beta testers', constraints: [{ contextName: beta.field, operator: beta.operator, values: beta.values, caseInsensitive: false, inverted: false }] } });
  id = created.data?.id ?? 0;
  await createRelease(admin)({ project, flag, environment: 'development', targets: [{ name: 'Beta', segments: [id] }, { name: 'Beta again', segments: [id] }] });
});
after(async () => {
  await deleteFlag(admin, project, flag);
  await deleteSegmentNamed(admin, segment);
  await close();
});

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test('describes a segment with the constraints it stands for and who made it', async () => {
  const output = await inspectSegment(unleash, { kind: 'segment', id });

  assert(output.kind === 'segment');

  const { createdAt, ...rest } = output;
  assert.match(createdAt ?? '', timestamp);
  assert.deepEqual(rest, {
    kind: 'segment',
    id,
    name: segment,
    description: 'Beta testers',
    constraints: [beta],
    createdBy: 'mateusz@getunleash.ai',
  });
});

test('lists each flag environment targeting the segment when usage is included', async () => {
  const output = await inspectSegment(unleash, { kind: 'segment', id, include: ['usage'] });

  assert(output.kind === 'segment');

  const { usedBy } = output;
  assert.deepEqual(usedBy, [{ project, flag, environment: 'development' }]);
});

test('names the project of a project segment', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments/7', method: 'GET' }).reply(200, { id: 7, name: 'Beta', project, constraints: [], createdAt: '2026-10-22T08:00:00.000Z' });

  const output = await inspectSegment(unleash, { kind: 'segment', id: 7 });

  assert.deepEqual(output, { kind: 'segment', id: 7, name: 'Beta', project, constraints: [], createdAt: '2026-10-22T08:00:00.000Z' });
});

test('fails with the Unleash error when the segment does not exist', async () => {
  const output = await inspectSegment(unleash, { kind: 'segment', id: 0 });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['No segment exists with ID "0"'] });
});

test('fails with the Unleash error when the usage cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments/7', method: 'GET' }).reply(200, { id: 7, name: 'Beta', constraints: [], createdAt: '2026-10-22T08:00:00.000Z' });
  stub.intercept({ path: '/api/admin/segments/7/strategies', method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await inspectSegment(unleash, { kind: 'segment', id: 7, include: ['usage'] });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
