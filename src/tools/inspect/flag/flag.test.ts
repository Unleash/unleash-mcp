import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fixedClock } from '../../../testClock.ts';
import { stubEnterprise } from '../../../unleash/testChangeRequest.ts';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { deleteFlag, deleteReleaseTemplate } from '../../../unleash/testSetup.ts';
import { createRelease } from '../../release/release.ts';
import { createEditionReader, type EditionReader } from '../../shared/changeRequest.ts';
import { inspectFlag } from './flag.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./flag.snapshot.json', import.meta.url).pathname);
const editionOf = createEditionReader(unleash);
const project = 'mcp-server';
const flag = 'mcp-inspected-flag';
const parent = 'mcp-inspected-parent';
const beta = { field: 'userId', operator: 'IN' as const, values: ['1', '2'] };
const values = [{ name: 'blue', payload: { type: 'string' as const, value: '#00f' }, share: 30 }, { name: 'green' }];
const template = 'mcp-inspect-plan';
const gradual = (rollout: string) => ({
  sortOrder: 0,
  strategyName: 'flexibleRollout',
  title: 'Everyone',
  parameters: { rollout, stickiness: 'default', groupId: parent },
});
const features = '/api/admin/projects/{projectId}/features';
const flagPath = `/api/admin/projects/${project}/features/${flag}`;
const tagsPath = `/api/admin/features/${flag}/tags`;
const pendingPath = `/api/admin/projects/${project}/change-requests/pending/${flag}`;
// Stubbed tests that are not about change requests skip reading them.
const openSource: EditionReader = async () => ({ kind: 'other' });

// The flags go before the template: a plan made from it keeps the template in use.
const deleteFlags = async (): Promise<void> => {
  await deleteFlag(admin, project, flag);
  await deleteFlag(admin, project, parent);
  await deleteReleaseTemplate(admin, template);
};

// Rolls the parent out in development through a release plan at its first milestone, moving on by time and then by exposure.
const addReleasePlan = async (): Promise<void> => {
  // The OpenAPI spec omits the body (it is `createReleasePlanTemplateSchema`).
  const created = await admin.POST('/api/admin/release-plan-templates', {
    body: {
      name: template,
      milestones: [
        {
          name: 'Canary',
          sortOrder: 0,
          strategies: [gradual('10')],
          transitionCondition: { type: 'time', intervalMinutes: 60 },
        },
        {
          name: 'Half',
          sortOrder: 1,
          strategies: [gradual('50')],
          transitionCondition: { type: 'exposure', minimumExposures: 5 },
        },
        { name: 'Everyone', sortOrder: 2, strategies: [gradual('100')] },
      ],
    } as never,
  });
  assert(created.data);
  const path = { project, featureName: parent, environment: 'development' };
  const plan = await admin.POST(
    '/api/admin/projects/{project}/features/{featureName}/environments/{environment}/release-plans',
    { params: { path }, body: { templateId: created.data.id } },
  );
  assert(plan.data?.milestones[0]);
  await admin.POST(
    '/api/admin/projects/{project}/features/{featureName}/environments/{environment}/release-plans/{planId}/milestones/{milestoneId}/start',
    {
      params: { path: { ...path, planId: plan.data.id, milestoneId: plan.data.milestones[0].id } },
    },
  );
};

before(async () => {
  await deleteFlags();
  await admin.POST(features, { params: { path: { projectId: project } }, body: { name: parent } });
  await admin.POST(features, { params: { path: { projectId: project } }, body: { name: flag, type: 'kill-switch' } });
  await admin.POST('/api/admin/projects/{projectId}/features/{child}/dependencies', {
    params: { path: { projectId: project, child: flag } },
    body: { feature: parent },
  });
  await admin.POST('/api/admin/features/{featureName}/tags', {
    params: { path: { featureName: flag } },
    body: { type: 'simple', value: 'mcp-inspect' },
  });
  await admin.POST('/api/admin/projects/{projectId}/features/{featureName}/link', {
    params: { path: { projectId: project, featureName: flag } },
    body: { url: 'https://example.com/mcp-inspect', title: 'Spec' },
  });
  await createRelease(admin)({
    project,
    flag: { name: flag, state: 'enabled' },
    environment: 'development',
    audience: {
      targets: [
        {
          name: 'Beta testers',
          rollout: 50,
          constraints: [beta],
          values,
          stickiness: 'userId',
          rolloutGroup: 'mcp-other-draw',
        },
      ],
    },
  });
  await addReleasePlan();
});
after(async () => {
  await deleteFlags();
  await close();
});

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// Fixed, and before any recording: a flag created at recording time with a lifetime has not reached its end.
const now = fixedClock('2026-10-29T00:00:00.000Z');

// The flag is created anew on every recording, so the timestamps are left to the partial match.
// A kill switch has no expected lifetime.
test('describes a flag with its lifecycle, environments, who worked on it, its parent, tags, links and the draw a target shares', async () => {
  const output = await inspectFlag(unleash, editionOf, now, { kind: 'flag', project, flag });

  assert(!('expectedLifetimeEndsAt' in output));
  assert.partialDeepStrictEqual(output, {
    kind: 'flag',
    name: flag,
    type: 'kill-switch',
    staleness: 'active',
    lifecycle: { stage: 'define' },
    environments: [
      {
        name: 'development',
        state: 'enabled',
        targets: [
          {
            name: 'Beta testers',
            rollout: 50,
            constraints: [beta],
            values,
            stickiness: 'userId',
            rolloutGroup: 'mcp-other-draw',
          },
        ],
      },
      { name: 'production', state: 'disabled' },
    ],
    createdBy: 'Mateusz K',
    collaborators: ['Mateusz K'],
    parent: { state: 'enabled', flag: parent },
    tags: [{ type: 'simple', value: 'mcp-inspect' }],
    links: [{ url: 'https://example.com/mcp-inspect', title: 'Spec' }],
  });
});

// The parent is created without a type, so Unleash gives it the default `release` with its lifetime.
test('names the flags that depend on a flag and the release plan rolling it out', async () => {
  const output = await inspectFlag(unleash, editionOf, now, { kind: 'flag', project, flag: parent });

  assert(output.kind === 'flag');
  assert.match(output.expectedLifetimeEndsAt ?? '', timestamp);
  assert.partialDeepStrictEqual(output, {
    kind: 'flag',
    name: parent,
    type: 'release',
    staleness: 'active',
    lifecycle: { stage: 'define' },
    environments: [
      {
        name: 'development',
        state: 'disabled',
        releasePlan: {
          name: template,
          milestones: [
            {
              name: 'Canary',
              active: true,
              transition: { type: 'time', intervalMinutes: 60 },
              targets: [{ name: 'Everyone', rollout: 10 }],
            },
            {
              name: 'Half',
              transition: { type: 'exposure', minimumExposures: 5 },
              targets: [{ name: 'Everyone', rollout: 50 }],
            },
            { name: 'Everyone', targets: [{ name: 'Everyone', rollout: 100 }] },
          ],
        },
      },
      { name: 'production', state: 'disabled' },
    ],
    createdBy: 'Mateusz K',
    collaborators: ['Mateusz K'],
    children: [flag],
  });
});

test('names the lifecycle stage as the Unleash UI does, with its status', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, {
    name: flag,
    type: 'release',
    lifecycle: { stage: 'completed', status: 'kept', enteredStageAt: '2026-10-21T09:00:00.000Z' },
  });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, openSource, now, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'flag',
    name: flag,
    type: 'release',
    staleness: 'active',
    lifecycle: { stage: 'cleanup', status: 'kept', enteredAt: '2026-10-21T09:00:00.000Z' },
    environments: [],
  });
});

test('treats a transition without a type as time based', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, {
    name: flag,
    type: 'release',
    environments: [
      {
        name: 'development',
        enabled: true,
        releasePlans: [
          {
            id: 'p1',
            name: 'Plan',
            milestones: [{ id: 'm1', name: 'Canary', transitionCondition: { intervalMinutes: 15 } }],
          },
        ],
      },
    ],
  });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, openSource, now, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'flag',
    name: flag,
    type: 'release',
    staleness: 'active',
    environments: [
      {
        name: 'development',
        state: 'enabled',
        releasePlan: {
          id: 'p1',
          name: 'Plan',
          milestones: [{ id: 'm1', name: 'Canary', transition: { type: 'time', intervalMinutes: 15 } }],
        },
      },
    ],
  });
});

test('tells when a person marked the flag stale', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release', stale: true });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, openSource, now, { kind: 'flag', project, flag });

  assert.deepEqual(output, { kind: 'flag', name: flag, type: 'release', staleness: 'stale', environments: [] });
});

test('tells when the flag is past its expected lifetime and nobody marked it stale', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: flagPath, method: 'GET' })
    .reply(200, { name: flag, type: 'release', stale: false, expectedLifetimeEndsAt: '2024-03-19T13:53:30.828Z' });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, openSource, now, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'flag',
    name: flag,
    type: 'release',
    staleness: 'potentially_stale',
    expectedLifetimeEndsAt: '2024-03-19T13:53:30.828Z',
    environments: [],
  });
});

test('tells when an SDK last saw the flag in each environment', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, {
    name: flag,
    type: 'release',
    environments: [
      { name: 'development', enabled: true, lastSeenAt: '2026-10-21T09:00:00.000Z' },
      { name: 'production', enabled: false, lastSeenAt: null },
    ],
  });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, openSource, now, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'flag',
    name: flag,
    type: 'release',
    staleness: 'active',
    environments: [
      { name: 'development', state: 'enabled', lastSeenAt: '2026-10-21T09:00:00.000Z' },
      { name: 'production', state: 'disabled' },
    ],
  });
});

// Unleash keeps whatever keys a payload was written with; the strict output schema would refuse an extra one.
test("returns only the type and value of a value's payload", async () => {
  const { unleash, stub } = createStubbedClient();
  const variant = {
    name: 'blue',
    weight: 1000,
    weightType: 'variable',
    stickiness: 'default',
    payload: { type: 'string', value: '#00f', note: 'from another client' },
  };
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, {
    name: flag,
    type: 'release',
    environments: [
      {
        name: 'development',
        enabled: true,
        strategies: [
          { name: 'flexibleRollout', title: 'Everyone', parameters: { rollout: '100' }, variants: [variant] },
        ],
      },
    ],
  });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, openSource, now, { kind: 'flag', project, flag });

  assert(output.kind === 'flag');
  assert.deepEqual(output.environments[0]?.targets?.[0]?.values, [
    { name: 'blue', payload: { type: 'string', value: '#00f' } },
  ]);
});

test('tells which values the parent must serve', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, {
    name: flag,
    type: 'release',
    dependencies: [{ feature: parent, enabled: true, variants: ['blue'] }],
  });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, openSource, now, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'flag',
    name: flag,
    type: 'release',
    staleness: 'active',
    environments: [],
    parent: { state: 'enabled', flag: parent, values: ['blue'] },
  });
});

test('tells when the parent must be off', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: flagPath, method: 'GET' })
    .reply(200, { name: flag, type: 'release', dependencies: [{ feature: parent, enabled: false, variants: [] }] });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, openSource, now, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'flag',
    name: flag,
    type: 'release',
    staleness: 'active',
    environments: [],
    parent: { state: 'disabled', flag: parent },
  });
});

test('fails with the Unleash error when the flag does not exist', async () => {
  const output = await inspectFlag(unleash, editionOf, now, { kind: 'flag', project, flag: 'mcp-unknown' });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 404,
    name: 'NotFoundError',
    reasons: [`There's no feature named "mcp-unknown" in project "mcp-server".`],
  });
});

test('fails with the Unleash error when the flag cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: flagPath, method: 'GET' })
    .reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, openSource, now, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});

test('fails with the Unleash error when the tags cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release' });
  stub
    .intercept({ path: tagsPath, method: 'GET' })
    .reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await inspectFlag(unleash, openSource, now, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});

test('lists the change requests waiting with changes to the flag, linked to the Unleash UI', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEnterprise(stub);
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release' });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });
  stub
    .intercept({ path: pendingPath, method: 'GET' })
    .reply(200, [{ id: 7, environment: 'production', state: 'In review' }]);

  const output = await inspectFlag(unleash, createEditionReader(unleash), now, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'flag',
    name: flag,
    type: 'release',
    staleness: 'active',
    environments: [],
    changeRequests: [
      {
        id: 7,
        state: 'In review',
        environment: 'production',
        url: `https://unleash.example/projects/${project}/change-requests/7`,
      },
    ],
  });
});

test('fails with the Unleash error when the change requests cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stubEnterprise(stub);
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release' });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });
  stub
    .intercept({ path: pendingPath, method: 'GET' })
    .reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await inspectFlag(unleash, createEditionReader(unleash), now, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});

test('fails with the Unleash error when the edition cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: '/api/admin/ui-config', method: 'GET' })
    .reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release' });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, createEditionReader(unleash), now, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});
