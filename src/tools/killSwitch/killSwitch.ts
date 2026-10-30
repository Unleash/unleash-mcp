import type { UnleashClient } from '../../unleash/client.ts';
import { planTargets } from '../shared/rollout/plan.ts';
import { createRollout } from '../shared/rollout/rollout.ts';
import { withDefaults } from '../shared/strategy.ts';
import type { Target } from '../shared/target.ts';
import type { KillSwitchInput } from './killSwitchInput.ts';
import type { KillSwitchResult } from './killSwitchOutput.ts';

const everyone: Target[] = [{ name: 'Everyone' }];

export const createKillSwitch = (unleash: UnleashClient) => {
  const rollout = createRollout(unleash);
  return async ({ project, flag, environment, targets = everyone }: KillSwitchInput): Promise<KillSwitchResult> => {
    const rolledOut = await rollout({
      project,
      flag,
      environment,
      // A kill switch stays for ever, so it never counts as stale.
      whenMissing: { type: 'kill-switch', lifetimeDays: 0 },
      planFor: (current) => planTargets({ flag: flag.name, state: flag.state, targets, current }),
    });
    if (rolledOut.kind === 'failed') return rolledOut;

    const outcome = { flag: rolledOut.flag, environment, targets: targets.map(withDefaults(flag.name)) };
    if (rolledOut.kind === 'requested')
      return { kind: 'pending_change_request', ...outcome, changeRequest: rolledOut.changeRequest };
    return { kind: 'switched', ...outcome };
  };
};
