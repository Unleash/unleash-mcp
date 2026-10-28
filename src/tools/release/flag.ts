import type { UnleashClient } from '../../unleash/client.ts';
import type { Failed } from '../shared/failed.ts';
import type { FlagState } from '../shared/flagState.ts';
import { createFlag, currentIn, type EnsuredFlag, readFlag } from '../shared/rollout/flag.ts';

type FlagInput = { flag: string; state: FlagState; environment: string };

// Only turning on creates a missing flag: turning off one that doesn't exist answers Unleash's 404.
export const ensureFlag = async (unleash: UnleashClient, project: string, input: FlagInput): Promise<EnsuredFlag | Failed> => {
  const found = await readFlag(unleash, project, input.flag);
  if (found.kind === 'failed') return found;
  if (found.kind === 'found') {
    const current = currentIn(found.environments, input.environment);
    return 'kind' in current ? current : { kind: 'existing', ...current };
  }
  if (input.state !== 'on') return found.notFound;
  const created = await createFlag(unleash, project, input.flag);
  if (created.kind === 'failed') return created;
  return { kind: 'new', enabled: false, strategyIds: [] };
};
