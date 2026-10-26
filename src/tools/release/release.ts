import type { UnleashClient } from '../../unleash/client.ts';
import type { ReleaseInput } from './releaseInput.ts';
import type { ReleaseResult } from './releaseOutput.ts';
import { type Failed, toFailed } from '../shared/failed.ts';
import { ensureFlag } from './flag.ts';
import { requestRelease } from './changeRequest.ts';
import { createChangeRequestReader, routeToEnvironment } from '../shared/changeRequest.ts';
import { type EnvironmentPath, type Plan, planRelease } from './releasePlan.ts';
import { rolloutOf } from '../shared/strategy.ts';

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
    const plan = planRelease(name, state, input.targets, flag);
    const outcome = {
      flag: { status: flag.kind, name, state },
      environment,
      targets: input.targets.map((t) => ({ ...t, rollout: rolloutOf(t) })),
    };

    if (route.kind === 'changeRequest') {
      const requested = await requestRelease(unleash, path, plan);
      if (requested.kind === 'failed') return requested;
      return { kind: 'pending_change_request', ...outcome, changeRequest: requested.changeRequest };
    }

    const applied = await applyPlan(unleash, path, plan);
    if (applied.kind === 'failed') return applied;
    return { kind: 'released', ...outcome };
  };
};

// Disabling goes first, so the feature stops being served even if a later write fails.
// Surplus strategies go last, so the environment never has zero strategies, which would make Unleash disable it.
// Enabling goes after them, once the environment has its audiences.
const applyPlan = async (unleash: UnleashClient, path: EnvironmentPath, plan: Plan): Promise<{ kind: 'applied' } | Failed> => {
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
  for (const id of plan.deletes) {
    const deleted = await unleash.DELETE(strategy, { params: { path: { ...path, strategyId: id } } });
    if (!deleted.response.ok) return toFailed(deleted);
  }
  if (plan.toggle === 'on') {
    const enabled = await unleash.POST(enable, { params: { path } });
    if (!enabled.response.ok) return toFailed(enabled);
  }
  return { kind: 'applied' };
};
