import type { UnleashClient } from '../../unleash/client.ts';
import { toFailed } from '../shared/failed.ts';
import type { SetStaleness } from './manageFlagInput.ts';
import type { Outcome } from './manageFlagOutput.ts';

export const setStaleness = async (
  unleash: UnleashClient,
  { project, flag, staleness }: SetStaleness,
): Promise<Outcome> => {
  const patched = await unleash.PATCH('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId: project, featureName: flag } },
    body: [{ op: 'replace', path: '/stale', value: staleness === 'stale' }],
  });
  if (!patched.response.ok) return toFailed(patched);
  return { kind: 'applied' };
};
