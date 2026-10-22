import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { deleteFlag, deleteReleaseTemplate } from '../../../unleash/testSetup.ts';
import { inspectFlag } from './flag.ts';
import { createRelease } from '../../release/release.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./flag.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-inspected-flag';
const parent = 'mcp-inspected-parent';
const beta = { field: 'userId', operator: 'IN' as const, values: ['1', '2'] };
const values = [{ name: 'blue', payload: { type: 'string' as const, value: '#00f' }, share: 30 }, { name: 'green' }];
const template = 'mcp-inspect-plan';
const gradual = (rollout: string) => ({ sortOrder: 0, strategyName: 'flexibleRollout', title: 'Everyone', parameters: { rollout, stickiness: 'default', groupId: parent } });
const features = '/api/admin/projects/{projectId}/features';
const flagPath = `/api/admin/projects/${project}/features/${flag}`;
const tagsPath = `/api/admin/features/${flag}/tags`;

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
        { name: 'Canary', sortOrder: 0, strategies: [gradual('10')], transitionCondition: { type: 'time', intervalMinutes: 60 } },
        { name: 'Half', sortOrder: 1, strategies: [gradual('50')], transitionCondition: { type: 'exposure', minimumExposures: 5 } },
        { name: 'Everyone', sortOrder: 2, strategies: [gradual('100')] },
      ],
    } as never,
  });
  const path = { project, featureName: parent, environment: 'development' };
  const plan = await admin.POST('/api/admin/projects/{project}/features/{featureName}/environments/{environment}/release-plans', { params: { path }, body: { templateId: created.data!.id } });
  await admin.POST('/api/admin/projects/{project}/features/{featureName}/environments/{environment}/release-plans/{planId}/milestones/{milestoneId}/start', {
    params: { path: { ...path, planId: plan.data!.id, milestoneId: plan.data!.milestones[0]!.id } },
  });
};

before(async () => {
  await deleteFlags();
  await admin.POST(features, { params: { path: { projectId: project } }, body: { name: parent } });
  await admin.POST(features, { params: { path: { projectId: project } }, body: { name: flag, type: 'kill-switch' } });
  await admin.POST('/api/admin/projects/{projectId}/features/{child}/dependencies', { params: { path: { projectId: project, child: flag } }, body: { feature: parent } });
  await admin.POST('/api/admin/features/{featureName}/tags', { params: { path: { featureName: flag } }, body: { type: 'simple', value: 'mcp-inspect' } });
  await admin.POST('/api/admin/projects/{projectId}/features/{featureName}/link', { params: { path: { projectId: project, featureName: flag } }, body: { url: 'https://example.com/mcp-inspect', title: 'Spec' } });
  await createRelease(admin)({ project, flag, environment: 'development', targets: [{ name: 'Beta testers', rollout: 50, constraints: [beta], values }] });
  await addReleasePlan();
});
after(async () => {
  await deleteFlags();
  await close();
});

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// The flag is created anew on every recording, so the timestamps are pinned to their shape, not their value.
// A kill switch has no expected lifetime.
test('describes a flag with its lifecycle, environments, who worked on it, its parent, tags and links', async () => {
  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  const { createdAt, lifecycle, ...rest } = output as Extract<typeof output, { kind: 'flag' }>;
  const { enteredAt, ...stage } = lifecycle ?? {};
  assert.match(createdAt ?? '', timestamp);
  assert.match(enteredAt ?? '', timestamp);
  assert.deepEqual({ lifecycle: stage, ...rest }, {
    kind: 'flag',
    name: flag,
    type: 'kill-switch',
    lifecycle: { stage: 'define' },
    environments: [
      { name: 'development', enabled: true, targets: [{ name: 'Beta testers', rollout: 50, constraints: [beta], values }] },
      { name: 'production', enabled: false },
    ],
    createdBy: 'Mateusz K',
    collaborators: ['Mateusz K'],
    parent: { flag: parent },
    tags: [{ type: 'simple', value: 'mcp-inspect' }],
    links: [{ url: 'https://example.com/mcp-inspect', title: 'Spec' }],
  });
});

// The parent is created without a type, so Unleash gives it the default `release` with its lifetime.
test('names the flags that depend on a flag and the release plan rolling it out', async () => {
  const output = await inspectFlag(unleash, { kind: 'flag', project, flag: parent });

  const { createdAt, lifecycle, expectedLifetimeEndsAt, ...rest } = output as Extract<typeof output, { kind: 'flag' }>;
  const { enteredAt, ...stage } = lifecycle ?? {};
  assert.match(createdAt ?? '', timestamp);
  assert.match(enteredAt ?? '', timestamp);
  assert.match(expectedLifetimeEndsAt ?? '', timestamp);
  assert.deepEqual({ lifecycle: stage, ...rest }, {
    kind: 'flag',
    name: parent,
    type: 'release',
    lifecycle: { stage: 'define' },
    environments: [
      {
        name: 'development',
        enabled: false,
        releasePlan: {
          name: template,
          milestones: [
            { name: 'Canary', active: true, transition: { type: 'time', intervalMinutes: 60 }, targets: [{ name: 'Everyone', rollout: 10 }] },
            { name: 'Half', transition: { type: 'exposure', minimumExposures: 5 }, targets: [{ name: 'Everyone', rollout: 50 }] },
            { name: 'Everyone', targets: [{ name: 'Everyone', rollout: 100 }] },
          ],
        },
      },
      { name: 'production', enabled: false },
    ],
    createdBy: 'Mateusz K',
    collaborators: ['Mateusz K'],
    children: [flag],
  });
});

test('names the lifecycle stage as the Unleash UI does, with its status', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release', lifecycle: { stage: 'completed', status: 'kept', enteredStageAt: '2026-10-21T09:00:00.000Z' } });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, { kind: 'flag', name: flag, type: 'release', lifecycle: { stage: 'cleanup', status: 'kept', enteredAt: '2026-10-21T09:00:00.000Z' }, environments: [] });
});

test('treats a transition without a type as time based', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, {
    name: flag,
    type: 'release',
    environments: [{ name: 'development', enabled: true, releasePlans: [{ name: 'Plan', milestones: [{ id: 'm1', name: 'Canary', transitionCondition: { intervalMinutes: 15 } }] }] }],
  });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'flag',
    name: flag,
    type: 'release',
    environments: [{ name: 'development', enabled: true, releasePlan: { name: 'Plan', milestones: [{ name: 'Canary', transition: { type: 'time', intervalMinutes: 15 } }] } }],
  });
});

test('tells when an SDK last saw the flag in each environment', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, {
    name: flag,
    type: 'release',
    environments: [{ name: 'development', enabled: true, lastSeenAt: '2026-10-21T09:00:00.000Z' }, { name: 'production', enabled: false, lastSeenAt: null }],
  });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, {
    kind: 'flag',
    name: flag,
    type: 'release',
    environments: [{ name: 'development', enabled: true, lastSeenAt: '2026-10-21T09:00:00.000Z' }, { name: 'production', enabled: false }],
  });
});

test('tells which variants the parent must resolve to', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release', dependencies: [{ feature: parent, enabled: true, variants: ['blue'] }] });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, { kind: 'flag', name: flag, type: 'release', environments: [], parent: { flag: parent, variants: ['blue'] } });
});

test('tells when the parent must be disabled', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release', dependencies: [{ feature: parent, enabled: false, variants: [] }] });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, { kind: 'flag', name: flag, type: 'release', environments: [], parent: { flag: parent, enabled: false } });
});

test('fails with the Unleash error when the flag does not exist', async () => {
  const output = await inspectFlag(unleash, { kind: 'flag', project, flag: 'mcp-unknown' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [`There's no feature named "mcp-unknown" in project "mcp-server".`] });
});

test('fails with the Unleash error when the flag cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(200, { version: 1, tags: [] });

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});

test('fails with the Unleash error when the tags cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: flagPath, method: 'GET' }).reply(200, { name: flag, type: 'release' });
  stub.intercept({ path: tagsPath, method: 'GET' }).reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await inspectFlag(unleash, { kind: 'flag', project, flag });

  assert.deepEqual(output, { kind: 'failed', status: 500, name: 'UnknownError', reasons: ['connect ECONNREFUSED 10.0.0.5:5432'] });
});
