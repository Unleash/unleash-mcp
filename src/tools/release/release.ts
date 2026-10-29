import type { UnleashClient } from '../../unleash/client.ts';
import { createRollout } from '../shared/rollout/rollout.ts';
import { withDefaults } from '../shared/strategy.ts';
import type { ReleaseInput } from './releaseInput.ts';
import type { ReleaseResult } from './releaseOutput.ts';
import { planAudience } from './releasePlan.ts';

export const createRelease = (unleash: UnleashClient) => {
  const rollout = createRollout(unleash);
  return async ({
    project,
    flag,
    environment,
    audience,
    expectedLifetimeDays,
  }: ReleaseInput): Promise<ReleaseResult> => {
    const rolledOut = await rollout({
      project,
      flag,
      environment,
      whenMissing: { lifetimeDays: expectedLifetimeDays },
      planFor: (current) => planAudience({ flag: flag.name, state: flag.state, audience, current }),
    });
    if (rolledOut.kind === 'failed') return rolledOut;

    const outcome = {
      flag: rolledOut.flag,
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
