import type { UnleashClient } from '../../unleash/client.ts';
import { toFailed } from '../shared/failed.ts';
import type { Delete } from './manageFlagInput.ts';
import type { Outcome } from './manageFlagOutput.ts';

export const deleteArchivedFlag = async (unleash: UnleashClient, { project, flag }: Delete): Promise<Outcome> => {
  const deleted = await unleash.POST('/api/admin/projects/{projectId}/delete', {
    params: { path: { projectId: project } },
    body: { features: [flag] },
  });
  if (!deleted.response.ok) return toFailed(deleted);
  return { kind: 'applied' };
};
