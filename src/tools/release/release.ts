import type { UnleashClient } from '../../unleash/client.ts';
import { createChangeRequestReader, routeToEnvironment } from '../shared/changeRequest.ts';
import { applyPlan } from '../shared/rollout/apply.ts';
import { requestPlan } from '../shared/rollout/changeRequest.ts';
import { rolloutOf } from '../shared/strategy.ts';
import { ensureFlag } from './flag.ts';
import type { ReleaseInput } from './releaseInput.ts';
import type { ReleaseResult } from './releaseOutput.ts';
import { planAudience } from './releasePlan.ts';

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
      const requested = await requestPlan(unleash, path, plan);
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
