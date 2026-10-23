import type { UnleashClient } from '../../../unleash/client.ts';
import type { ProjectsQuery } from '../searchInput.ts';
import type { Projects } from '../searchOutput.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';

// The core view skips the derived fields (health, counts, owners) Unleash would otherwise compute per project.
// Unleash lists projects without a filter, so the query is applied here, on the id and the name.
export const searchProjects = async (unleash: UnleashClient, { query }: ProjectsQuery): Promise<Projects | Failed> => {
  const listed = await unleash.GET('/api/admin/projects', { params: { query: { view: 'core' } } });
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const text = query?.toLowerCase();
  const projects = listed.data.projects
    .filter((p) => !text || p.id.toLowerCase().includes(text) || p.name.toLowerCase().includes(text))
    .map(({ id, name, createdAt }) => ({ id, name, ...(createdAt ? { createdAt } : {}) }));
  return { kind: 'projects', projects };
};
