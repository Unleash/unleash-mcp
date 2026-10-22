import type { UnleashClient } from '../../../unleash/client.ts';
import type { ContextFieldsQuery } from '../searchInput.ts';
import type { SearchResult } from '../searchOutput.ts';
import { toFailed } from '../../shared/failed.ts';

// Unleash scopes the list itself, as its UI asks: a project's list with the global fields included is what
// a flag there can use; the global list with project fields included is everything. The name match is applied here.
export const searchContextFields = async (unleash: UnleashClient, { project, query }: ContextFieldsQuery): Promise<SearchResult> => {
  const listed = project
    ? await unleash.GET('/api/admin/projects/{projectId}/context', { params: { path: { projectId: project }, query: { include: 'root' } } })
    : await unleash.GET('/api/admin/context', { params: { query: { include: 'project' } } });
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const fields = listed.data
    .filter((f) => !query || f.name.toLowerCase().includes(query.toLowerCase()))
    .map(({ name, project, description, stickiness, createdAt, usedInProjects, usedInFeatures }) => ({
      name,
      ...(project ? { project } : {}),
      ...(description ? { description } : {}),
      ...(stickiness ? { stickiness: true as const } : {}),
      ...(createdAt ? { createdAt } : {}),
      usedInProjects: usedInProjects ?? 0,
      usedInFlags: usedInFeatures ?? 0,
    }));
  return { kind: 'context_fields', fields };
};
