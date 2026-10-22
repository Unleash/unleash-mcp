import type { UnleashClient } from '../unleash/client.ts';
import type { FlagQuery } from './inspectInput.ts';
import type { FlagType, InspectResult } from './inspectOutput.ts';
import { toFailed } from './failed.ts';

export const inspectFlag = async (unleash: UnleashClient, { project, flag }: FlagQuery): Promise<InspectResult> => {
  const found = await unleash.GET('/api/admin/projects/{projectId}/features/{featureName}', { params: { path: { projectId: project, featureName: flag } } });
  if (!found.response.ok || !found.data) return toFailed(found);
  const { name, type, createdAt, createdBy } = found.data;
  return {
    kind: 'flag',
    name,
    type: type as FlagType,
    ...(createdAt ? { createdAt } : {}),
    ...(createdBy ? { createdBy: createdBy.name } : {}),
  };
};
