import type { UnleashClient } from '../../../unleash/client.ts';
import type { SegmentsQuery } from '../searchInput.ts';
import type { SearchResult } from '../searchOutput.ts';
import { toFailed } from '../../shared/failed.ts';

// Unleash lists segments without a filter, so the project and the query are applied here; the rows carry
// what else the list knows, so the agent can filter on scope, author, date or usage itself.
// A segment is usable in a project when it is global or belongs to that project.
export const searchSegments = async (unleash: UnleashClient, { project, query }: SegmentsQuery): Promise<SearchResult> => {
  const listed = await unleash.GET('/api/admin/segments');
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const segments = (listed.data.segments ?? [])
    .filter((s) => (!project || !s.project || s.project === project) && (!query || s.name.toLowerCase().includes(query.toLowerCase())))
    .map(({ id, name, project, createdAt, createdBy, usedInProjects, usedInFeatures }) => ({
      id,
      name,
      ...(project ? { project } : {}),
      createdAt,
      ...(createdBy ? { createdBy } : {}),
      usedInProjects: usedInProjects ?? 0,
      usedInFlags: usedInFeatures ?? 0,
    }));
  return { kind: 'segments', segments };
};
