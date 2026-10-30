import type { UnleashClient } from '../../unleash/client.ts';
import { planTargets } from '../shared/rollout/plan.ts';
import { createRollout } from '../shared/rollout/rollout.ts';
import { withDefaults } from '../shared/strategy.ts';
import type { ExperimentInput } from './experimentInput.ts';
import type { ExperimentResult } from './experimentOutput.ts';

export const createExperiment = (unleash: UnleashClient) => {
  const rollout = createRollout(unleash);
  return async ({
    project,
    flag,
    environment,
    targets,
    impressionData = true,
    expectedLifetimeDays,
  }: ExperimentInput): Promise<ExperimentResult> => {
    const rolledOut = await rollout({
      project,
      flag,
      environment,
      // A missing experiment reports impressions unless told not to; an existing flag keeps its type and setting.
      whenMissing: { type: 'experiment', impressionData, lifetimeDays: expectedLifetimeDays },
      planFor: (current) => planTargets({ flag: flag.name, state: flag.state, targets, current }),
    });
    if (rolledOut.kind === 'failed') return rolledOut;

    const outcome = { flag: rolledOut.flag, environment, targets: targets.map(withDefaults(flag.name)) };
    if (rolledOut.kind === 'requested')
      return { kind: 'pending_change_request', ...outcome, changeRequest: rolledOut.changeRequest };
    return { kind: 'split', ...outcome };
  };
};
