import type { UnleashClient } from '../../unleash/client.ts';
import { createChangeRequestReader, routeToEnvironment } from '../shared/changeRequest.ts';
import { type Failed, toFailed } from '../shared/failed.ts';
import { rolloutOf } from '../shared/strategy.ts';
import { requestRelease } from './changeRequest.ts';
import { ensureFlag } from './flag.ts';
import { type StartedMilestone, startMilestone } from './milestone.ts';
import type { ReleaseInput } from './releaseInput.ts';
import type { ReleaseResult } from './releaseOutput.ts';
import { type EnvironmentPath, type Plan, planAudience } from './releasePlan.ts';
import { type AppliedTemplate, applyTemplate } from './template.ts';

const strategies = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies';
const strategy = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies/{strategyId}';
const enable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on';
const disable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/off';

export const createRelease = (unleash: UnleashClient) => {
  const environmentsOf = createChangeRequestReader(unleash);
  return async (input: ReleaseInput): Promise<ReleaseResult> => {
    const { project, environment } = input;
    // Checked before any write, so a failed check leaves Unleash untouched.
    const route = await routeToEnvironment(environmentsOf, project, environment);
    if (route.kind === 'failed') return route;

    const { name, state } = input.flag;
    // The flag is created directly even where changes need approval, as Unleash's own import does.
    const flag = await ensureFlag(unleash, project, { flag: name, state, environment });
    if (flag.kind === 'failed') return flag;

    const path = { projectId: project, featureName: name, environment };
    const { audience } = input;
    const plan = planAudience(name, state, audience, flag);
    const outcome = {
      flag: { status: flag.kind, name, state },
      environment,
      ...('targets' in audience && { targets: audience.targets.map((t) => ({ ...t, rollout: rolloutOf(t) })) }),
    };

    if (route.kind === 'changeRequest') {
      const requested = await requestRelease(unleash, path, plan);
      if (requested.kind === 'failed') return requested;
      return {
        kind: 'pending_change_request',
        ...outcome,
        ...(plan.template && { template: { id: plan.template } }),
        ...(plan.milestone && { releasePlan: { id: plan.milestone.planId, milestone: plan.milestone.milestoneId } }),
        changeRequest: requested.changeRequest,
      };
    }

    const applied = await applyPlan(unleash, path, plan);
    if (applied.kind === 'failed') return applied;
    return { kind: 'released', ...outcome, ...(applied.template && { template: applied.template }), ...(applied.releasePlan && { releasePlan: applied.releasePlan }) };
  };
};

type AppliedPlan = { kind: 'applied'; template?: AppliedTemplate['template']; releasePlan?: StartedMilestone['releasePlan'] };

// Disabling goes first, so the feature stops being served even if a later write fails.
// A template's plan, or a milestone of the plan, goes in after the strategies, and surplus strategies go last, so the environment
// never has zero strategies, which would make Unleash disable it. Enabling goes after them, once the environment has its audiences.
const applyPlan = async (unleash: UnleashClient, path: EnvironmentPath, plan: Plan): Promise<AppliedPlan | Failed> => {
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
