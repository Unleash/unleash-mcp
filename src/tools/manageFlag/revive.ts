import type { UnleashClient } from '../../unleash/client.ts';
import type { Revive } from './manageFlagInput.ts';
import type { Outcome } from './manageFlagOutput.ts';
import { toFailed } from '../shared/failed.ts';

export const reviveFlag = async (unleash: UnleashClient, { project, flag }: Revive): Promise<Outcome> => {
  const revived = await unleash.POST('/api/admin/projects/{projectId}/revive', { params: { path: { projectId: project } }, body: { features: [flag] } });
  if (!revived.response.ok) return toFailed(revived);
  return { kind: 'applied' };
};
