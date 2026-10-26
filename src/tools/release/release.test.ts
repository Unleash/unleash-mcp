import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createStubbedClient, createRecordedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteFlag, deleteSegmentNamed } from '../../unleash/testSetup.ts';
import { createRelease } from './release.ts';
import { releaseInput } from './releaseInput.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./release.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-flag';

const segment = 'mcp-beta';
let segmentId: number | undefined;
let changeRequestId: number | undefined;

// The flag is gone before the tests, so the first release creates it.
before(async () => {
  await deleteFlag(admin, project, flag);
  await deleteSegmentNamed(admin, segment);
  const created = await admin.POST('/api/admin/segments', { body: { name: segment, constraints: [] } });
  segmentId = created.data?.id;
});
// The change request goes first, and the flag before the segment:
// Unleash may refuse to delete a segment that is in use.
after(async () => {
  // A submitted change request can't be deleted, only cancelled, and only by its author. The OpenAPI spec omits the body.
  if (changeRequestId) await unleash.PUT('/api/admin/projects/{projectId}/change-requests/{id}/state', {
    params: { path: { projectId: project, id: String(changeRequestId) } },
    body: { state: 'Cancelled' } as never,
  });
  await deleteFlag(admin, project, flag);
  await deleteSegmentNamed(admin, segment);
  await close();
});

test('creates a missing flag', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert.deepEqual(output, { kind: 'released', flag: { status: 'new', name: flag, state: 'on' }, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });
});

test('releases an existing flag', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert.deepEqual(output, { kind: 'released', flag: { status: 'existing', name: flag, state: 'on' }, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] });
});

test('releases to several audiences', async () => {
  const release = createRelease(unleash);
  const beta = { field: 'userId', operator: 'IN' as const, values: ['1', '2'] };
  const blue = { name: 'blue', payload: { type: 'string' as const, value: 'blue' } };

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }, { name: 'Beta testers', constraints: [beta], values: [blue] }] } });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { status: 'existing', name: flag, state: 'on' },
    environment: 'development',
    targets: [{ name: 'Everyone', rollout: 50 }, { name: 'Beta testers', rollout: 100, constraints: [beta], values: [blue] }],
  });
});

test('splits an audience across values', async () => {
  const release = createRelease(unleash);
  const values = [{ name: 'control', share: 50 }, { name: 'new' }];

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Checkout test', values }] } });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { status: 'existing', name: flag, state: 'on' },
    environment: 'development',
    targets: [{ name: 'Checkout test', rollout: 100, values }],
  });
});

test('releases to an audience defined in Unleash', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Beta testers', segments: [segmentId!] }] } });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { status: 'existing', name: flag, state: 'on' },
    environment: 'development',
    targets: [{ name: 'Beta testers', rollout: 100, segments: [segmentId!] }],
  });
});

test('removes the audiences a release leaves out', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Beta testers' }] } });

  assert.deepEqual(output, { kind: 'released', flag: { status: 'existing', name: flag, state: 'on' }, environment: 'development', targets: [{ name: 'Beta testers', rollout: 100 }] });
});

test('turns a flag off', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag: { name: flag, state: 'off' }, environment: 'development', audience: { targets: [{ name: 'Beta testers' }] } });

  assert.deepEqual(output, { kind: 'released', flag: { status: 'existing', name: flag, state: 'off' }, environment: 'development', targets: [{ name: 'Beta testers', rollout: 100 }] });
});

test('turns a flag back on', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Beta testers' }] } });

  assert.deepEqual(output, { kind: 'released', flag: { status: 'existing', name: flag, state: 'on' }, environment: 'development', targets: [{ name: 'Beta testers', rollout: 100 }] });
});

// `mcp-server` requires change requests in production.
test('puts the release in a change request where the environment requires one', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'production', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert(output.kind === 'pending_change_request');
  changeRequestId = output.changeRequest.id;
  assert.partialDeepStrictEqual(output, { flag: { status: 'existing', name: flag, state: 'on' }, environment: 'production', targets: [{ name: 'Everyone', rollout: 50 }], changeRequest: { state: 'In review' } });
});

// Open source has no change requests, so the stubs in each test cover only the flag and its writes.
const createStubbedOpenSource = () => {
  const stubbed = createStubbedClient();
  stubbed.stub.intercept({ path: '/api/admin/ui-config', method: 'GET' }).reply(200, { versionInfo: { current: { enterprise: '' } } });
  return stubbed;
};


const feature = `/api/admin/projects/${project}/features/${flag}`;
const base = `${feature}/environments/development`;

test('fails with the Unleash error when the rollout cannot be set', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, { name: flag });
  stub.intercept({ path: `${base}/strategies`, method: 'POST' }).reply(400, unleashError('BadDataError', 'You have not added the current environment to the project'));

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 400,
    name: 'BadDataError',
    reasons: ['You have not added the current environment to the project'],
  });
});

test('fails with the Unleash error when the environment cannot be enabled', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, { name: flag });
  stub.intercept({ path: `${base}/strategies`, method: 'POST' }).reply(200, {});
  stub.intercept({ path: `${base}/on`, method: 'POST' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});

const development = (...strategyIds: string[]) => ({
  name: flag,
  environments: [{ name: 'development', enabled: true, strategies: strategyIds.map((id) => ({ id, name: 'flexibleRollout' })) }],
});

test('fails with the Unleash error when an audience cannot be changed', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1'));
  stub.intercept({ path: `${base}/strategies/s1`, method: 'PUT' }).reply(403, unleashError('PermissionError', 'You need the UPDATE_FEATURE_STRATEGY permission'));

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert.deepEqual(output, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the UPDATE_FEATURE_STRATEGY permission'] });
});

test('fails with the Unleash error when a left out audience cannot be removed', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1', 's2'));
  stub.intercept({ path: `${base}/strategies/s1`, method: 'PUT' }).reply(200, {});
  stub.intercept({ path: `${base}/strategies/s2`, method: 'DELETE' }).reply(403, unleashError('PermissionError', 'You need the DELETE_FEATURE_STRATEGY permission'));

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert.deepEqual(output, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the DELETE_FEATURE_STRATEGY permission'] });
});

// The update only matches when it clears the segments, so leaving them out would fail the release.
test('takes the segments away from an audience that no longer names them', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1'));
  const clearsSegments = (body: string): boolean => JSON.parse(body).segments?.length === 0;
  stub.intercept({ path: `${base}/strategies/s1`, method: 'PUT', body: clearsSegments }).reply(200, {});

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert.equal(output.kind, 'released');
});

// No stub for enabling: a request to turn the environment on would fail the release.
test('leaves an enabled environment as it is', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1'));
  stub.intercept({ path: `${base}/strategies/s1`, method: 'PUT' }).reply(200, {});

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert.equal(output.kind, 'released');
});

// No stub for changing the audience: a request to change it first would fail the test differently.
test('stops serving the feature before changing its audiences', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1'));
  stub.intercept({ path: `${base}/off`, method: 'POST' }).reply(403, unleashError('PermissionError', 'You need the UPDATE_FEATURE_ENVIRONMENT permission'));

  const output = await release({ project, flag: { name: flag, state: 'off' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert.deepEqual(output, { kind: 'failed', status: 403, name: 'PermissionError', reasons: ['You need the UPDATE_FEATURE_ENVIRONMENT permission'] });
});

test('refuses an audience with a key it does not know', () => {
  const parsed = releaseInput.audience.safeParse({ targets: [{ name: 'Everyone' }], target: [{ name: 'Beta testers' }] });

  assert.equal(parsed.success, false);
});

test('fails on an error reply without a body', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, { name: flag });
  stub.intercept({ path: `${base}/strategies`, method: 'POST' }).reply(503, '', { headers: { 'content-length': '0' } });

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert.deepEqual(output, { kind: 'failed', status: 503, name: 'UnknownError', reasons: [] });
});

// No stubs for the flag: reading or creating it would fail the test.
test('fails without touching the flag when the edition cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  const release = createRelease(unleash);
  stub.intercept({ path: '/api/admin/ui-config', method: 'GET' }).reply(401, unleashError('AuthenticationRequired', 'You must log in to use Unleash'));

  const output = await release({ project, flag: { name: flag, state: 'on' }, environment: 'development', audience: { targets: [{ name: 'Everyone', rollout: 50 }] } });

  assert.deepEqual(output, { kind: 'failed', status: 401, name: 'AuthenticationRequired', reasons: ['You must log in to use Unleash'] });
});
