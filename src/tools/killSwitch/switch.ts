import type { UnleashClient } from '../../unleash/client.ts';
import type { Failed } from '../shared/failed.ts';
import { createFlag, currentIn, type EnsuredFlag, readFlag } from '../shared/rollout/flag.ts';

/** The switch as it is found in the environment, created as a kill switch when missing, in either state. */
export const ensureSwitch = async (unleash: UnleashClient, project: string, flag: string, environment: string): Promise<EnsuredFlag | Failed> => {
  const found = await readFlag(unleash, project, flag);
  if (found.kind === 'failed') return found;
  if (found.kind === 'found') {
    const current = currentIn(found.environments, environment);
    return 'kind' in current ? current : { kind: 'existing', ...current };
  }
  const created = await createFlag(unleash, project, flag, 'kill-switch');
  if (created.kind === 'failed') return created;
  return { kind: 'new', enabled: false, strategyIds: [] };
};
