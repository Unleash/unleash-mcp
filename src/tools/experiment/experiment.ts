import type { UnleashClient } from '../../unleash/client.ts';
import { ensureFlag } from '../shared/rollout/ensureFlag.ts';
import { planTargets } from '../shared/rollout/plan.ts';
import { createRollout } from '../shared/rollout/rollout.ts';
import { withDefaults } from '../shared/strategy.ts';
import type { ExperimentInput } from './experimentInput.ts';
import type { ExperimentResult } from './experimentOutput.ts';

export const createExperiment = (unleash: UnleashClient) => {
  const rollout = createRollout(unleash);
  return async ({
    project,
    flag: { name, state },
    environment,
    targets,
    impressionData = true,
  }: ExperimentInput): Promise<ExperimentResult> => {
    const rolledOut = await rollout({
      project,
      name,
      environment,
      // A missing experiment reports impressions unless told not to; an existing flag keeps its type and setting.
      ensure: () =>
        ensureFlag(unleash, project, {
          flag: name,
          state,
          environment,
          create: { type: 'experiment', impressionData },
        }),
      planFor: (flag) => planTargets(name, state, targets, flag),
    });
    if (rolledOut.kind === 'failed') return rolledOut;

    const outcome = {
      flag: { status: rolledOut.flag.kind, name, state },
      environment,
      targets: targets.map(withDefaults),
    };
    if (rolledOut.kind === 'requested')
      return { kind: 'pending_change_request', ...outcome, changeRequest: rolledOut.changeRequest };
    return { kind: 'split', ...outcome };
  };
};
