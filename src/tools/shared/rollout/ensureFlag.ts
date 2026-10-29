import type { UnleashClient } from '../../../unleash/client.ts';
import type { Failed } from '../failed.ts';
import { createFlag, type EnsuredFlag, environmentStateIn, type FlagOptions, readFlag } from './flag.ts';

/** `whenMissing` is what a missing flag is created with: by default an untyped flag, as the Unleash UI does. */
type FlagInput = { flag: string; environment: string; whenMissing?: FlagOptions };

/** The flag as it is found in the environment, created when missing, in either state. */
export const ensureFlag = async (
  unleash: UnleashClient,
  project: string,
  input: FlagInput,
): Promise<EnsuredFlag | Failed> => {
  const found = await readFlag(unleash, project, input.flag);
  if (found.kind === 'failed') return found;
  if (found.kind === 'found') {
    const current = environmentStateIn(found.environments, input.environment);
    return 'kind' in current ? current : { kind: 'found', ...current };
  }
  const created = await createFlag(unleash, { project, name: input.flag, ...input.whenMissing });
  if (created.kind === 'failed') return created;
  return { kind: 'created', state: 'disabled', strategyIds: [] };
};
