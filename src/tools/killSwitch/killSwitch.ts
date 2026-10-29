import type { UnleashClient } from '../../unleash/client.ts';
import { ensureFlag } from '../shared/rollout/ensureFlag.ts';
import { planTargets } from '../shared/rollout/plan.ts';
import { createRollout } from '../shared/rollout/rollout.ts';
import { withDefaults } from '../shared/strategy.ts';
import type { Target } from '../shared/target.ts';
import type { KillSwitchInput } from './killSwitchInput.ts';
import type { KillSwitchResult } from './killSwitchOutput.ts';

const everyone: Target[] = [{ name: 'Everyone' }];

export const createKillSwitch = (unleash: UnleashClient) => {
  const rollout = createRollout(unleash);
  return async ({
    project,
    flag: { name, state },
    environment,
    targets = everyone,
  }: KillSwitchInput): Promise<KillSwitchResult> => {
    const rolledOut = await rollout({
      project,
      name,
      environment,
      ensure: () => ensureFlag(unleash, project, { flag: name, environment, create: { type: 'kill-switch' } }),
      planFor: (current) => planTargets({ flag: name, state, targets, current }),
    });
    if (rolledOut.kind === 'failed') return rolledOut;

    const outcome = {
      flag: { status: rolledOut.flag.kind, name, state },
      environment,
      targets: targets.map(withDefaults),
    };
    if (rolledOut.kind === 'requested')
      return { kind: 'pending_change_request', ...outcome, changeRequest: rolledOut.changeRequest };
    return { kind: 'switched', ...outcome };
  };
};
