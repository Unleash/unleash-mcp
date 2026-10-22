import type { UnleashClient } from '../../../unleash/client.ts';
import type { ContextFieldQuery } from '../inspectInput.ts';
import type { InspectResult } from '../inspectOutput.ts';
import { toUsedBy } from '../shared/usage.ts';
import { toFailed } from '../../shared/failed.ts';

export const inspectContextField = async (unleash: UnleashClient, { project, name, include = [] }: ContextFieldQuery): Promise<InspectResult> => {
  const usage = include.includes('usage');
  const [found, used] = await Promise.all([
    project
      ? unleash.GET('/api/admin/projects/{projectId}/context/{contextField}', { params: { path: { projectId: project, contextField: name } } })
      : unleash.GET('/api/admin/context/{contextField}', { params: { path: { contextField: name } } }),
    usage ? unleash.GET('/api/admin/context/{contextField}/strategies', { params: { path: { contextField: name } } }) : undefined,
  ]);
  if (!found.response.ok || !found.data) return toFailed(found);
  if (used && (!used.response.ok || !used.data)) return toFailed(used);
  const { description, stickiness, legalValues } = found.data;
  return {
    kind: 'context_field',
    name: found.data.name,
    ...(found.data.project ? { project: found.data.project } : {}),
    ...(description ? { description } : {}),
    stickiness: stickiness ?? false,
    ...(legalValues?.length ? { legalValues: legalValues.map(({ value, description }) => ({ value, ...(description ? { description } : {}) })) } : {}),
    ...(used?.data ? { usedBy: toUsedBy(used.data.strategies) } : {}),
  };
};
