import type { UnleashClient } from '../../unleash/client.ts';
import { ensureFlag } from '../shared/rollout/ensureFlag.ts';
import { createRollout } from '../shared/rollout/rollout.ts';
import { withDefaults } from '../shared/strategy.ts';
import type { ReleaseInput } from './releaseInput.ts';
import type { ReleaseResult } from './releaseOutput.ts';
import { planAudience } from './releasePlan.ts';

export const createRelease = (unleash: UnleashClient) => {
  const rollout = createRollout(unleash);
  return async ({ project, flag: { name, state }, environment, audience }: ReleaseInput): Promise<ReleaseResult> => {
    const rolledOut = await rollout({
      project,
      name,
      environment,
      ensure: () => ensureFlag(unleash, project, { flag: name, environment }),
      planFor: (flag) => planAudience(name, state, audience, flag),
    });
    if (rolledOut.kind === 'failed') return rolledOut;

    const outcome = {
      flag: { status: rolledOut.flag.kind, name, state },
      environment,
      ...('targets' in audience && { targets: audience.targets.map(withDefaults) }),
    };

    if (rolledOut.kind === 'requested') {
      const { plan, changeRequest } = rolledOut;
      return {
        kind: 'pending_change_request',
        ...outcome,
        ...(plan.template && { template: { id: plan.template } }),
        ...(plan.milestone && { releasePlan: { id: plan.milestone.planId, milestone: plan.milestone.milestoneId } }),
        changeRequest,
      };
    }

    const { applied } = rolledOut;
    return {
      kind: 'released',
      ...outcome,
      ...(applied.template && { template: applied.template }),
      ...(applied.releasePlan && { releasePlan: applied.releasePlan }),
    };
  };
};
