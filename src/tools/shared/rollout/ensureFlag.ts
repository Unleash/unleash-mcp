import type { UnleashClient } from '../../../unleash/client.ts';
import type { Failed } from '../failed.ts';
import type { FlagState } from '../flagState.ts';
import { createFlag, currentIn, type EnsuredFlag, type FlagOptions, readFlag } from './flag.ts';

/** `create` is what a missing flag is created with: by default an untyped flag, as the Unleash UI does. */
type FlagInput = { flag: string; state: FlagState; environment: string; create?: FlagOptions };

// Only turning on creates a missing flag: turning off one that doesn't exist answers Unleash's 404.
export const ensureFlag = async (
  unleash: UnleashClient,
  project: string,
  input: FlagInput,
): Promise<EnsuredFlag | Failed> => {
  const found = await readFlag(unleash, project, input.flag);
  if (found.kind === 'failed') return found;
  if (found.kind === 'found') {
    const current = currentIn(found.environments, input.environment);
    return 'kind' in current ? current : { kind: 'existing', ...current };
  }
  if (input.state !== 'on') return found.notFound;
  const created = await createFlag(unleash, project, input.flag, input.create);
  if (created.kind === 'failed') return created;
  return { kind: 'new', enabled: false, strategyIds: [] };
};
