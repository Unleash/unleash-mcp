import type { UnleashClient } from '../../../unleash/client.ts';
import { type Failed, toFailed } from '../failed.ts';
import { type StartedMilestone, startMilestone } from './milestone.ts';
import type { EnvironmentPath, Plan } from './plan.ts';
import { type AppliedTemplate, applyTemplate } from './template.ts';

const strategies = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies';
const strategy =
  '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies/{strategyId}';
const enable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on';
const disable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/off';

/** What the direct writes started on the way: the plan copied from a template, or the milestone now served. */
export type AppliedPlan = {
  kind: 'applied';
  template?: AppliedTemplate['template'];
  releasePlan?: StartedMilestone['releasePlan'];
};

// Disabling goes first, so the feature stops being served even if a later write fails.
// A template's plan, or a milestone of the plan, goes in after the strategies, and surplus strategies go last, so the environment
// never has zero strategies, which would make Unleash disable it. Enabling goes after them, once the environment has its audiences.
export const applyPlan = async (
  unleash: UnleashClient,
  path: EnvironmentPath,
  plan: Plan,
): Promise<AppliedPlan | Failed> => {
  if (plan.toggle === 'off') {
    const disabled = await unleash.POST(disable, { params: { path } });
    if (!disabled.response.ok) return toFailed(disabled);
  }
  for (const { id, strategy: body } of plan.updates) {
    const updated = await unleash.PUT(strategy, { params: { path: { ...path, strategyId: id } }, body });
    if (!updated.response.ok) return toFailed(updated);
  }
  for (const body of plan.adds) {
    const added = await unleash.POST(strategies, { params: { path }, body });
    if (!added.response.ok) return toFailed(added);
  }
  const applied = plan.template ? await applyTemplate(unleash, path, plan.template) : undefined;
  if (applied?.kind === 'failed') return applied;
  const started = plan.milestone ? await startMilestone(unleash, path, plan.milestone) : undefined;
  if (started?.kind === 'failed') return started;
  for (const id of plan.deletes) {
    const deleted = await unleash.DELETE(strategy, { params: { path: { ...path, strategyId: id } } });
    if (!deleted.response.ok) return toFailed(deleted);
  }
  if (plan.toggle === 'on') {
    const enabled = await unleash.POST(enable, { params: { path } });
    if (!enabled.response.ok) return toFailed(enabled);
  }
  return { kind: 'applied', template: applied?.template, releasePlan: started?.releasePlan };
};
