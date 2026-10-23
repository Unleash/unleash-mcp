import type { UnleashClient } from '../../../unleash/client.ts';
import type { SegmentQuery } from '../inspectInput.ts';
import type { Segment } from '../inspectOutput.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import { toConstraint } from '../shared/constraint.ts';
import { toUsedBy } from '../shared/usage.ts';

// Usage is the strategies-by-segment request the Unleash UI makes before a delete. Unleash answers it with an
// indexed join, but a widely used segment makes it long, so it only runs when included.
export const inspectSegment = async (unleash: UnleashClient, { id, include = [] }: SegmentQuery): Promise<Segment | Failed> => {
  const [found, used] = await Promise.all([
    unleash.GET('/api/admin/segments/{id}', { params: { path: { id } } }),
    include.includes('usage') ? unleash.GET('/api/admin/segments/{id}/strategies', { params: { path: { id } } }) : undefined,
  ]);
  if (!found.response.ok || !found.data) return toFailed(found);
  if (used && (!used.response.ok || !used.data)) return toFailed(used);
  const { name, project, description, constraints, createdAt, createdBy } = found.data;
  return {
    kind: 'segment',
    id: found.data.id,
    name,
    ...(project ? { project } : {}),
    ...(description ? { description } : {}),
    constraints: constraints.map(toConstraint),
    ...(createdAt ? { createdAt } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(used?.data ? { usedBy: toUsedBy(used.data.strategies) } : {}),
  };
};
