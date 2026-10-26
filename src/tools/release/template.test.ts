import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { applyTemplate } from './template.ts';

const path = { projectId: 'mcp-server', featureName: 'mcp-flag', environment: 'development' };
const releasePlans = '/api/admin/projects/mcp-server/features/mcp-flag/environments/development/release-plans';
const templateId = '01JB9GGTGQYEQ9D40R17T3YVW2';
const json = { headers: { 'content-type': 'application/json' } };

// Stubbed, not recorded: the sandbox's limit of 10 release templates leaves room for only configure's.
test('answers with the plan and the milestone it started', async () => {
  const { unleash, stub } = createStubbedClient();
  const plan = {
    id: '01JB9GGTGQYEQ9D40R17T3YVW3', discriminator: 'plan', name: 'Gradual rollout', featureName: 'mcp-flag', environment: 'development',
    createdByUserId: 1, createdAt: '2026-10-26T10:00:00.000Z', releasePlanTemplateId: templateId, activeMilestoneId: 'm1',
    milestones: [{ id: 'm1', name: 'Internal', sortOrder: 0, strategies: [] }, { id: 'm2', name: 'Everyone', sortOrder: 1, strategies: [] }],
  };
  stub.intercept({ path: releasePlans, method: 'POST', body: JSON.stringify({ templateId }) }).reply(200, plan, json);

  const applied = await applyTemplate(unleash, path, templateId);

  assert.deepEqual(applied, { kind: 'applied', template: { id: templateId, plan: 'Gradual rollout', milestone: 'Internal' } });
});

test('fails with the Unleash error when the template cannot be applied', async () => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: releasePlans, method: 'POST' }).reply(404, unleashError('NotFoundError', 'Could not find release plan template'), json);

  const applied = await applyTemplate(unleash, path, templateId);

  assert.deepEqual(applied, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['Could not find release plan template'] });
});
