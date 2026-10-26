import assert from 'node:assert/strict';
import type { components } from '../../unleash/api.d.ts';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteFlag, deleteSegmentNamed } from '../../unleash/testSetup.ts';
import { createSegment } from '../configure/segment.ts';
import { defineFlag } from '../manageFlag/define.ts';
import { createRelease } from '../release/release.ts';
import { createEvaluate } from './evaluate.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./evaluate.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-evaluated-flag';
const parent = 'mcp-evaluated-parent';
const child = 'mcp-evaluated-child';
const segment = 'mcp-evaluated-segment';
const environment = 'development';
const sdkOnlyStrategy = 'mcp-custom-strategy';
const users = { targeted: '1', outsideRollout: '9', targetedBySdkOnly: '2', untargeted: '3' };
const userIn = (...values: string[]) => ({ field: 'userId', operator: 'IN' as const, values });
const beta = userIn(users.targeted, users.outsideRollout);
const paused = { name: 'Paused', result: 'disabled' };
const sessionOutsideRollout = 'b';
const everyone = { name: 'Everyone', result: 'matched', matchedBy: {} };
const bySession = (missedBy: object) => ({ name: 'By session', result: 'missed', missedBy });
const nobodyYet = (stickiness: string) => ({ name: 'Nobody yet', result: 'missed', missedBy: { rollout: 0, stickiness } });
const sdkOnlyMissed = { result: 'missed', missedBy: { constraints: [userIn(users.targetedBySdkOnly)] } };
let segmentId = 0;

const addTarget = (featureName: string, env: string, body: components['schemas']['createFeatureStrategySchema']) =>
  admin.POST('/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies', { params: { path: { projectId: project, featureName, environment: env } }, body });

const addSdkOnlyTarget = (featureName: string, env: string) =>
  addTarget(featureName, env, { name: sdkOnlyStrategy, constraints: [{ contextName: 'userId', operator: 'IN', values: [users.targetedBySdkOnly], caseInsensitive: false, inverted: false }] });

const deleteSetup = async () => {
  for (const name of [flag, child, parent]) await deleteFlag(admin, project, name);
  await deleteSegmentNamed(admin, segment);
  await admin.DELETE('/api/admin/strategies/{name}', { params: { path: { name: sdkOnlyStrategy } } });
};

// The flags go first: Unleash refuses to delete a strategy or segment in use. A new flag is off, so the parent stays unsatisfied.
before(async () => {
  await deleteSetup();
  await admin.POST('/api/admin/strategies', { body: { name: sdkOnlyStrategy, parameters: [] } });
  const created = await createSegment(admin, { kind: 'segment', action: 'create', name: segment, constraints: [{ field: 'appName', operator: 'IN', values: ['unleash-mcp'] }] });
  segmentId = created.kind === 'applied' ? created.id : 0;
  await createRelease(admin)({ project, flag: { name: flag, state: 'on' }, environment, audience: { targets: [{ name: 'Beta', rollout: 80, segments: [segmentId], constraints: [beta], values: [{ name: 'blue', payload: { type: 'string', value: 'b' } }] }] } });
  await addTarget(flag, environment, { name: 'flexibleRollout', title: paused.name, disabled: true });
  await addSdkOnlyTarget(flag, environment);
  await addSdkOnlyTarget(flag, 'production');
  await addTarget(flag, 'production', { name: 'flexibleRollout', title: 'Everyone', parameters: { rollout: '100', stickiness: 'default', groupId: flag } });
  await addTarget(flag, 'production', { name: 'flexibleRollout', title: 'By session', parameters: { rollout: '50', stickiness: 'sessionId', groupId: flag } });
  await addTarget(flag, 'production', { name: 'flexibleRollout', title: 'Nobody yet', parameters: { rollout: '0', stickiness: 'default', groupId: flag } });
  for (const name of [parent, child]) await defineFlag(admin, { action: 'define', project, flag: name });
  await addSdkOnlyTarget(child, environment);
  await admin.POST('/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on', { params: { path: { projectId: project, featureName: child, environment } } });
  await admin.POST('/api/admin/projects/{projectId}/features/{child}/dependencies', { params: { path: { projectId: project, child } }, body: { feature: parent } });
});
after(async () => {
  await deleteSetup();
  await close();
});

const evaluateAs = (...contexts: { appName: string; userId: string }[]) => createEvaluate(unleash)({ queries: contexts.map((context) => ({ flag, environment, context })) });

test('the feature is on for a context a target matches, with the value it serves and all that let the context in', async () => {
  const output = await evaluateAs({ appName: 'unleash-mcp', userId: users.targeted });

  assert.deepEqual(output, {
    results: [{
      kind: 'evaluated', flag, environment, result: 'on',
      value: { name: 'blue', payload: { type: 'string', value: 'b' } },
      targets: [
        { name: 'Beta', result: 'matched', matchedBy: { segments: [{ id: segmentId, name: segment }], constraints: [beta], rollout: 80, stickiness: 'userId' } },
        paused,
        { result: 'missed', missedBy: { constraints: [userIn(users.targetedBySdkOnly)] } },
      ],
    }],
  });
});

test('the feature is unknown when only a target Unleash cannot evaluate could turn it on, a disabled one aside', async () => {
  const output = await evaluateAs({ appName: 'unleash-mcp', userId: users.targetedBySdkOnly });

  assert.deepEqual(output, {
    results: [{
      kind: 'evaluated', flag, environment, result: 'unknown',
      targets: [
        { name: 'Beta', result: 'missed', missedBy: { constraints: [beta] } },
        paused,
        { result: 'unknown', matchedBy: { constraints: [userIn(users.targetedBySdkOnly)] } },
      ],
    }],
  });
});

test('the feature is off for a context no target matches, a disabled one aside, each naming only what kept the context out', async () => {
  const output = await evaluateAs(
    { appName: 'unleash-mcp', userId: users.untargeted },
    { appName: 'another-app', userId: users.targeted },
    { appName: 'unleash-mcp', userId: users.outsideRollout },
  );

  assert.deepEqual(output, {
    results: [
      { kind: 'evaluated', flag, environment, result: 'off', targets: [{ name: 'Beta', result: 'missed', missedBy: { constraints: [beta] } }, paused, sdkOnlyMissed] },
      { kind: 'evaluated', flag, environment, result: 'off', targets: [{ name: 'Beta', result: 'missed', missedBy: { segments: [{ id: segmentId, name: segment }] } }, paused, sdkOnlyMissed] },
      { kind: 'evaluated', flag, environment, result: 'off', targets: [{ name: 'Beta', result: 'missed', missedBy: { rollout: 80, stickiness: 'userId' } }, paused, sdkOnlyMissed] },
    ],
  });
});

test('an off feature names what blocks it whatever its targets: its environment or its parent', async () => {
  const context = { appName: 'unleash-mcp', userId: users.targetedBySdkOnly };

  const output = await createEvaluate(unleash)({ queries: [{ flag, environment: 'production', context }, { flag: child, environment, context }] });

  assert.deepEqual(output, {
    results: [
      { kind: 'evaluated', flag, environment: 'production', result: 'off', blockedBy: ['environment'], targets: [{ result: 'unknown', matchedBy: { constraints: [userIn(users.targetedBySdkOnly)] } }, everyone, bySession({ stickiness: 'sessionId' }), nobodyYet('userId')] },
      { kind: 'evaluated', flag: child, environment, result: 'off', blockedBy: ['parent'], targets: [{ result: 'unknown', matchedBy: { constraints: [userIn(users.targetedBySdkOnly)] } }] },
    ],
  });
});

test('a rollout under 100 names the field it groups contexts by, or that field alone when the context lacks it', async () => {
  const contexts: Record<string, string>[] = [{ userId: users.untargeted, sessionId: sessionOutsideRollout }, { sessionId: sessionOutsideRollout }, {}];

  const output = await createEvaluate(unleash)({ queries: contexts.map((context) => ({ flag, environment: 'production', context: { appName: 'unleash-mcp', ...context } })) });

  const evaluated = (...targets: object[]) => ({ kind: 'evaluated', flag, environment: 'production', result: 'off', blockedBy: ['environment'], targets: [sdkOnlyMissed, everyone, ...targets] });
  assert.deepEqual(output, {
    results: [
      evaluated(bySession({ rollout: 50, stickiness: 'sessionId' }), nobodyYet('userId')),
      evaluated(bySession({ rollout: 50, stickiness: 'sessionId' }), nobodyYet('sessionId')),
      evaluated(bySession({ stickiness: 'sessionId' }), nobodyYet('random')),
    ],
  });
});

test('answers each query in the order asked, a failure naming its flag and environment', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/playground/features/missing', method: 'POST' }).reply(404, unleashError('NotFoundError', 'Could not find feature flag missing'));
  stub.intercept({ path: `/api/admin/playground/features/${flag}`, method: 'POST' }).reply(200, { feature: { isEnabled: true, isEnabledInCurrentEnvironment: true, strategies: { data: [] } } });
  const evaluate = createEvaluate(unleash);

  const output = await evaluate({
    queries: [{ flag: 'missing', environment, context: { appName: 'unleash-mcp' } }, { flag, environment, context: { appName: 'unleash-mcp' } }],
  });

  assert.deepEqual(output, {
    results: [
      { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['Could not find feature flag missing'], flag: 'missing', environment },
      { kind: 'evaluated', flag, environment, result: 'on' },
    ],
  });
});
