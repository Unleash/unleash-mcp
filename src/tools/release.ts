import type { UnleashClient } from '../unleash/client.ts';
import type { ReleaseInput } from './releaseInput.ts';
import type { ReleaseOutput } from './releaseOutput.ts';

export const createRelease =
  (_unleash: UnleashClient) =>
  async (input: ReleaseInput): Promise<ReleaseOutput> => ({
    kind: 'released',
    flag: input.flag,
    environment: input.environment,
    rollout: input.rollout,
  });
