import type { UnleashClient } from '../../unleash/client.ts';
import type { components } from '../../unleash/api.d.ts';
import type { ContextFieldQuery } from './inspectInput.ts';
import type { InspectResult, Usage } from './inspectOutput.ts';
import { toFailed } from '../shared/failed.ts';

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

// Unleash answers with one entry per strategy; a flag with several strategies on the field in one
// environment is still one use, so entries are deduplicated by project, flag and environment.
const toUsedBy = (strategies: UnleashUsage[]): Usage[] => {
  const uses = strategies.map(({ projectId, featureName, environment }): Usage => ({ project: projectId, flag: featureName, environment }));
  return uses.filter((use, index) => uses.findIndex((other) => isSameUse(use, other)) === index);
};

type UnleashUsage = components['schemas']['contextFieldStrategiesSchema']['strategies'][number];

const isSameUse = (a: Usage, b: Usage): boolean => a.project === b.project && a.flag === b.flag && a.environment === b.environment;
