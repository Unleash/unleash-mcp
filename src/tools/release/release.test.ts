import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { production, stubChangeRequestsIn } from '../../unleash/testChangeRequest.ts';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { cancelChangeRequest, deleteFlag, deleteReleaseTemplate, deleteSegmentNamed } from '../../unleash/testSetup.ts';
import { createSegment } from '../configure/segment.ts';
import { createRelease } from './release.ts';
import { releaseInput } from './releaseInput.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./release.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-flag';

const segment = 'mcp-beta';
const template = 'mcp-release-plan';
let segmentId: number;
let templateId: string;
let changeRequestId: number | undefined;

// The flag is gone before the tests, so the first release creates it.
before(async () => {
  await deleteFlag(admin, project, flag);
  await deleteSegmentNamed(admin, segment);
  await deleteReleaseTemplate(admin, template);
  const created = await createSegment(admin, { kind: 'segment', action: 'create', name: segment, constraints: [] });
  assert(created.kind === 'applied');
  segmentId = created.id;
  // The OpenAPI spec omits the body (it is `createReleasePlanTemplateSchema`).
  const plan = await admin.POST('/api/admin/release-plan-templates', {
    body: {
      name: template,
      milestones: [
        {
          name: 'Internal',
          sortOrder: 0,
          strategies: [
            {
              sortOrder: 0,
              strategyName: 'flexibleRollout',
              title: 'Internal',
              parameters: { rollout: '100', stickiness: 'default', groupId: flag },
            },
          ],
        },
        {
          name: 'Everyone',
          sortOrder: 1,
          strategies: [
            {
              sortOrder: 0,
              strategyName: 'flexibleRollout',
              title: 'Everyone',
              parameters: { rollout: '100', stickiness: 'default', groupId: flag },
            },
          ],
        },
      ],
    } as never,
  });
  assert(plan.data);
  templateId = plan.data.id;
});
// The change request goes first, and the flag before the segment and the template:
// Unleash may refuse to delete a segment or a template that is in use.
after(async () => {
  if (changeRequestId) await cancelChangeRequest(unleash, project, changeRequestId);
  await deleteFlag(admin, project, flag);
  await deleteSegmentNamed(admin, segment);
  await deleteReleaseTemplate(admin, template);
  await close();
});

// The recording pins the create with the expected lifetime.
test('creates a missing flag with its expected lifetime', async () => {
  const release = createRelease(unleash);

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
    expectedLifetimeDays: 30,
  });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { origin: 'created', name: flag, state: 'enabled' },
    environment: 'development',
    targets: [{ name: 'Everyone', rollout: 50, stickiness: 'default', rolloutGroup: flag }],
  });
});

// The recording pins the rollout group on the strategy, so the rollout picks the same users as the other flag's.
test('releases an existing flag, picking the same users as another flag', async () => {
  const release = createRelease(unleash);

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone', rollout: 50, rolloutGroup: 'mcp-other-flag' }] },
  });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { origin: 'found', name: flag, state: 'enabled' },
    environment: 'development',
    targets: [{ name: 'Everyone', rollout: 50, rolloutGroup: 'mcp-other-flag', stickiness: 'default' }],
  });
});

test('releases to several audiences', async () => {
  const release = createRelease(unleash);
  const beta = { field: 'userId', operator: 'IN' as const, values: ['1', '2'] };
  const blue = { name: 'blue', payload: { type: 'string' as const, value: 'blue' } };

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: {
      targets: [
        { name: 'Everyone', rollout: 50 },
        { name: 'Beta testers', constraints: [beta], values: [blue] },
      ],
    },
  });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { origin: 'found', name: flag, state: 'enabled' },
    environment: 'development',
    targets: [
      { name: 'Everyone', rollout: 50, stickiness: 'default', rolloutGroup: flag },
      {
        name: 'Beta testers',
        rollout: 100,
        constraints: [beta],
        values: [blue],
        stickiness: 'default',
        rolloutGroup: flag,
      },
    ],
  });
});

test('splits an audience across values', async () => {
  const release = createRelease(unleash);
  const values = [{ name: 'control', share: 50 }, { name: 'new' }];

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Checkout test', values }] },
  });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { origin: 'found', name: flag, state: 'enabled' },
    environment: 'development',
    targets: [{ name: 'Checkout test', rollout: 100, values, stickiness: 'default', rolloutGroup: flag }],
  });
});

test('releases to an audience defined in Unleash', async () => {
  const release = createRelease(unleash);

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Beta testers', segments: [segmentId] }] },
  });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { origin: 'found', name: flag, state: 'enabled' },
    environment: 'development',
    targets: [{ name: 'Beta testers', rollout: 100, segments: [segmentId], stickiness: 'default', rolloutGroup: flag }],
  });
});

test('removes the audiences a release leaves out', async () => {
  const release = createRelease(unleash);

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Beta testers' }] },
  });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { origin: 'found', name: flag, state: 'enabled' },
    environment: 'development',
    targets: [{ name: 'Beta testers', rollout: 100, stickiness: 'default', rolloutGroup: flag }],
  });
});

test('turns a flag off', async () => {
  const release = createRelease(unleash);

  const output = await release({
    project,
    flag: { name: flag, state: 'disabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Beta testers' }] },
  });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { origin: 'found', name: flag, state: 'disabled' },
    environment: 'development',
    targets: [{ name: 'Beta testers', rollout: 100, stickiness: 'default', rolloutGroup: flag }],
  });
});

test('turns a flag back on', async () => {
  const release = createRelease(unleash);

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Beta testers' }] },
  });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { origin: 'found', name: flag, state: 'enabled' },
    environment: 'development',
    targets: [{ name: 'Beta testers', rollout: 100, stickiness: 'default', rolloutGroup: flag }],
  });
});

test('moves the release plan to another milestone, replacing the audiences', async () => {
  const release = createRelease(unleash);
  const path = { project, featureName: flag, environment: 'development' };
  const plan = await admin.POST(
    '/api/admin/projects/{project}/features/{featureName}/environments/{environment}/release-plans',
    { params: { path }, body: { templateId } },
  );
  assert(plan.data?.milestones[1]);
  const releasePlan = plan.data.id;

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { releasePlan, milestone: plan.data.milestones[1].id },
  });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { origin: 'found', name: flag, state: 'enabled' },
    environment: 'development',
    releasePlan: { id: releasePlan, plan: template, milestone: 'Everyone' },
  });
});

// `mcp-server` requires change requests in production.
test('puts the release in a change request where the environment requires one', async () => {
  const release = createRelease(unleash);

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'production',
    audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  assert(output.kind === 'pending_change_request');
  changeRequestId = output.changeRequest.id;
  assert.partialDeepStrictEqual(output, {
    flag: { origin: 'found', name: flag, state: 'enabled' },
    environment: 'production',
    targets: [{ name: 'Everyone', rollout: 50, stickiness: 'default', rolloutGroup: flag }],
    changeRequest: { state: 'In review' },
  });
});

// Open source has no change requests, so the stubs in each test cover only the flag and its writes.
const createStubbedOpenSource = () => {
  const stubbed = createStubbedClient();
  stubbed.stub
    .intercept({ path: '/api/admin/ui-config', method: 'GET' })
    .reply(200, { versionInfo: { current: { enterprise: '' } } });
  return stubbed;
};

const feature = `/api/admin/projects/${project}/features/${flag}`;
const base = `${feature}/environments/development`;

test('creates a missing flag when turning it off', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub
    .intercept({ path: feature, method: 'GET' })
    .reply(404, unleashError('NotFoundError', `Could not find feature flag ${flag}`));
  stub.intercept({ path: `/api/admin/projects/${project}/features`, method: 'POST' }).reply(201, { name: flag });
  stub.intercept({ path: `${base}/strategies`, method: 'POST' }).reply(200, {});

  const output = await release({
    project,
    flag: { name: flag, state: 'disabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone' }] },
  });

  assert.partialDeepStrictEqual(output, { kind: 'released', flag: { origin: 'created', state: 'disabled' } });
});

test('fails with the Unleash error when the rollout cannot be set', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, { name: flag });
  stub
    .intercept({ path: `${base}/strategies`, method: 'POST' })
    .reply(400, unleashError('BadDataError', 'You have not added the current environment to the project'));

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
  });

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
  stub
    .intercept({ path: `${base}/on`, method: 'POST' })
    .reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});

const development = (...strategyIds: string[]) => ({
  name: flag,
  environments: [
    { name: 'development', enabled: true, strategies: strategyIds.map((id) => ({ id, name: 'flexibleRollout' })) },
  ],
});

test('fails with the Unleash error when an audience cannot be changed', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1'));
  stub
    .intercept({ path: `${base}/strategies/s1`, method: 'PUT' })
    .reply(403, unleashError('PermissionError', 'You need the UPDATE_FEATURE_STRATEGY permission'));

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 403,
    name: 'PermissionError',
    reasons: ['You need the UPDATE_FEATURE_STRATEGY permission'],
  });
});

test('fails with the Unleash error when a left out audience cannot be removed', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1', 's2'));
  stub.intercept({ path: `${base}/strategies/s1`, method: 'PUT' }).reply(200, {});
  stub
    .intercept({ path: `${base}/strategies/s2`, method: 'DELETE' })
    .reply(403, unleashError('PermissionError', 'You need the DELETE_FEATURE_STRATEGY permission'));

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 403,
    name: 'PermissionError',
    reasons: ['You need the DELETE_FEATURE_STRATEGY permission'],
  });
});

// The update only matches when it clears the segments, so leaving them out would fail the release.
test('takes the segments away from an audience that no longer names them', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1'));
  const clearsSegments = (body: string): boolean => JSON.parse(body).segments?.length === 0;
  stub.intercept({ path: `${base}/strategies/s1`, method: 'PUT', body: clearsSegments }).reply(200, {});

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  assert.equal(output.kind, 'released');
});

// No stub for enabling: a request to turn the environment on would fail the release.
test('leaves an enabled environment as it is', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1'));
  stub.intercept({ path: `${base}/strategies/s1`, method: 'PUT' }).reply(200, {});

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  assert.equal(output.kind, 'released');
});

// No stub for changing the audience: a request to change it first would fail the test differently.
test('stops serving the feature before changing its audiences', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1'));
  stub
    .intercept({ path: `${base}/off`, method: 'POST' })
    .reply(403, unleashError('PermissionError', 'You need the UPDATE_FEATURE_ENVIRONMENT permission'));

  const output = await release({
    project,
    flag: { name: flag, state: 'disabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 403,
    name: 'PermissionError',
    reasons: ['You need the UPDATE_FEATURE_ENVIRONMENT permission'],
  });
});

// Stubbed, not recorded: the sandbox's limit of 10 release templates leaves room for only configure's.
// The delete is stubbed only once the plan is in, so removing the old audience first fails the test.
test('releases through a release template, replacing the audiences', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  const template = '01JB9GGTGQYEQ9D40R17T3YVW2';
  stub.intercept({ path: feature, method: 'GET' }).reply(200, development('s1'));
  stub.intercept({ path: `${base}/release-plans`, method: 'POST' }).reply(
    200,
    () => {
      stub.intercept({ path: `${base}/strategies/s1`, method: 'DELETE' }).reply(200, {});
      return { name: 'Gradual rollout', activeMilestoneId: 'm1', milestones: [{ id: 'm1', name: 'Internal' }] };
    },
    { headers: { 'content-type': 'application/json' } },
  );

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { template },
  });

  assert.deepEqual(output, {
    kind: 'released',
    flag: { origin: 'found', name: flag, state: 'enabled' },
    environment: 'development',
    template: { id: template, plan: 'Gradual rollout', milestone: 'Internal' },
  });
});

test('puts a template release in a change request where the environment requires one', async () => {
  const { unleash, stub } = createStubbedClient();
  const template = '01JB9GGTGQYEQ9D40R17T3YVW2';
  stubChangeRequestsIn(stub, project, production);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, { name: flag });
  stub
    .intercept({ path: `/api/admin/projects/${project}/environments/production/change-requests`, method: 'POST' })
    .reply(200, { id: 7, state: 'In review' });
  const release = createRelease(unleash);

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'production',
    audience: { template },
  });

  assert.deepEqual(output, {
    kind: 'pending_change_request',
    flag: { origin: 'found', name: flag, state: 'enabled' },
    environment: 'production',
    template: { id: template },
    changeRequest: { id: 7, state: 'In review', url: `https://unleash.example/projects/${project}/change-requests/7` },
  });
});

test('puts a milestone start in a change request where the environment requires one', async () => {
  const { unleash, stub } = createStubbedClient();
  const milestone = { releasePlan: '01JB9GGTGQYEQ9D40R17T3YVW3', milestone: 'm2' };
  stubChangeRequestsIn(stub, project, production);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, { name: flag });
  stub
    .intercept({ path: `/api/admin/projects/${project}/environments/production/change-requests`, method: 'POST' })
    .reply(200, { id: 7, state: 'In review' });
  const release = createRelease(unleash);

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'production',
    audience: milestone,
  });

  assert.deepEqual(output, {
    kind: 'pending_change_request',
    flag: { origin: 'found', name: flag, state: 'enabled' },
    environment: 'production',
    releasePlan: { id: milestone.releasePlan, milestone: 'm2' },
    changeRequest: { id: 7, state: 'In review', url: `https://unleash.example/projects/${project}/change-requests/7` },
  });
});

test('takes one of targets, a release template or a milestone', () => {
  const targetsAndTemplate = { targets: [{ name: 'Everyone' }], template: '01JB9GGTGQYEQ9D40R17T3YVW2' };
  const templateAndMilestone = {
    template: '01JB9GGTGQYEQ9D40R17T3YVW2',
    releasePlan: '01JB9GGTGQYEQ9D40R17T3YVW3',
    milestone: 'm2',
  };

  assert.equal(releaseInput.shape.audience.safeParse({}).success, false);
  assert.equal(releaseInput.shape.audience.safeParse(targetsAndTemplate).success, false);
  assert.equal(releaseInput.shape.audience.safeParse(templateAndMilestone).success, false);
});

test('refuses an audience with a key it does not know', () => {
  const parsed = releaseInput.shape.audience.safeParse({
    targets: [{ name: 'Everyone' }],
    target: [{ name: 'Beta testers' }],
  });

  assert.equal(parsed.success, false);
});

test('fails on an error reply without a body', async () => {
  const { unleash, stub } = createStubbedOpenSource();
  const release = createRelease(unleash);
  stub.intercept({ path: feature, method: 'GET' }).reply(200, { name: flag });
  stub.intercept({ path: `${base}/strategies`, method: 'POST' }).reply(503, '', { headers: { 'content-length': '0' } });

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  assert.deepEqual(output, { kind: 'failed', status: 503, name: 'UnknownError', reasons: [] });
});

// No stubs for the flag: reading or creating it would fail the test.
test('fails without touching the flag when the edition cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  const release = createRelease(unleash);
  stub
    .intercept({ path: '/api/admin/ui-config', method: 'GET' })
    .reply(401, unleashError('AuthenticationRequired', 'You must log in to use Unleash'));

  const output = await release({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 401,
    name: 'AuthenticationRequired',
    reasons: ['You must log in to use Unleash'],
  });
});
