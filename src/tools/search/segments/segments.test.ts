import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { deleteSegmentNamed } from '../../../unleash/testSetup.ts';
import { createSegment } from '../../configure/segment.ts';
import { searchSegments } from './segments.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./segments.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const global = 'mcp-searched-segment';
const projectScoped = 'mcp-searched-project-segment';
let globalId = 0;
let projectScopedId = 0;

before(async () => {
  for (const name of [global, projectScoped]) await deleteSegmentNamed(admin, name);
  const createdGlobal = await createSegment(admin, { kind: 'segment', action: 'create', name: global, constraints: [] });
  globalId = createdGlobal.kind === 'applied' ? createdGlobal.id : 0;
  const createdProjectScoped = await createSegment(admin, { kind: 'segment', action: 'create', project, name: projectScoped, constraints: [] });
  projectScopedId = createdProjectScoped.kind === 'applied' ? createdProjectScoped.id : 0;
});
after(async () => {
  for (const name of [global, projectScoped]) await deleteSegmentNamed(admin, name);
  await close();
});

const creator = 'mateusz@getunleash.ai';

// Unleash sorts the list by name, so the project segment comes first.
test('finds segments by a part of their name, case insensitive, with what the agent filters on itself', async () => {
  const output = await searchSegments(unleash, { kind: 'segments', query: 'MCP-SEARCHED' });

  assert.partialDeepStrictEqual(output, {
    kind: 'segments',
    segments: [
      { id: projectScopedId, name: projectScoped, project, createdBy: creator, usedInProjects: 0, usedInFlags: 0 },
      { id: globalId, name: global, createdBy: creator, usedInProjects: 0, usedInFlags: 0 },
    ],
  });
});

test('keeps the segments usable in a project: global or owned by it', async () => {
  const output = await searchSegments(unleash, { kind: 'segments', project, query: 'mcp-searched' });

  assert.partialDeepStrictEqual(output, { kind: 'segments', segments: [{ name: projectScoped, project }, { name: global }] });
});

test('leaves out the segments owned by another project', async () => {
  const output = await searchSegments(unleash, { kind: 'segments', project: 'mcp-other', query: 'mcp-searched' });

  assert(output.kind === 'segments');
  assert.equal(output.segments.length, 1);
  assert.partialDeepStrictEqual(output.segments, [{ name: global }]);
});

test('fails with the Unleash error when the segments cannot be listed', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments', method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await searchSegments(unleash, { kind: 'segments' });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
