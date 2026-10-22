import type { UnleashClient } from '../unleash/client.ts';
import type { ProjectQuery } from './searchInput.ts';
import type { SearchResult } from './searchOutput.ts';
import { toFailed } from './failed.ts';

// The project overview is what the Unleash UI reads for a project's environments. The environments-by-project
// endpoint instead lists every environment of the instance and answers an unknown project with an empty list.
export const searchProject = async (unleash: UnleashClient, { project }: ProjectQuery): Promise<SearchResult> => {
  const found = await unleash.GET('/api/admin/projects/{projectId}/overview', { params: { path: { projectId: project } } });
  if (!found.response.ok || !found.data) return toFailed(found);
  return { kind: 'project', environments: (found.data.environments ?? []).map((e) => e.environment) };
};
