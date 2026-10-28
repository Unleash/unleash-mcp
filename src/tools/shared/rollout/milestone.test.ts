import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { startMilestone } from './milestone.ts';

const path = { projectId: 'mcp-server', featureName: 'mcp-flag', environment: 'development' };
const milestone = { planId: '01JB9GGTGQYEQ9D40R17T3YVW3', milestoneId: 'm2' };
const start =
  '/api/admin/projects/mcp-server/features/mcp-flag/environments/development/release-plans/01JB9GGTGQYEQ9D40R17T3YVW3/milestones/m2/start';
const json = { headers: { 'content-type': 'application/json' } };

// Only a JSON request matches: Unleash refuses one without a content type.
test('answers with the plan and the milestone it started', async () => {
  const { unleash, stub } = createStubbedClient();
  const plan = {
    id: milestone.planId,
    discriminator: 'plan',
    name: 'Gradual rollout',
    featureName: 'mcp-flag',
    environment: 'development',
    createdByUserId: 1,
    createdAt: '2026-10-26T10:00:00.000Z',
    releasePlanTemplateId: '01JB9GGTGQYEQ9D40R17T3YVW2',
    activeMilestoneId: 'm2',
    milestones: [
      { id: 'm1', name: 'Internal', sortOrder: 0, strategies: [] },
      { id: 'm2', name: 'Everyone', sortOrder: 1, strategies: [] },
    ],
  };
  stub
    .intercept({ path: start, method: 'POST', headers: { 'content-type': 'application/json' } })
    .reply(200, plan, json);

  const started = await startMilestone(unleash, path, milestone);

  assert.deepEqual(started, {
    kind: 'started',
    releasePlan: { id: milestone.planId, plan: 'Gradual rollout', milestone: 'Everyone' },
  });
});

test('fails with the Unleash error when the milestone cannot be started', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: start, method: 'POST' })
    .reply(404, unleashError('NotFoundError', 'Could not find milestone'), json);

  const started = await startMilestone(unleash, path, milestone);

  assert.deepEqual(started, {
    kind: 'failed',
    status: 404,
    name: 'NotFoundError',
    reasons: ['Could not find milestone'],
  });
});
