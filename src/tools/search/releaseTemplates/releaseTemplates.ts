import type { UnleashClient } from '../../../unleash/client.ts';
import type { ReleaseTemplatesQuery } from '../searchInput.ts';
import type { ReleaseTemplates } from '../searchOutput.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';

/**
 * Lists release templates by name, with the ids release takes; milestones and their strategies stay off.
 * Unleash lists templates without a name filter, so the query is applied here, and it leaves archived ones out.
 * In a project, Unleash adds the global templates to the project's own when asked to include root.
 */
export const searchReleaseTemplates = async (unleash: UnleashClient, { project, query }: ReleaseTemplatesQuery): Promise<ReleaseTemplates | Failed> => {
  const listed = project
    ? await unleash.GET('/api/admin/projects/{projectId}/release-templates', { params: { path: { projectId: project }, query: { include: 'root' } } })
    : await unleash.GET('/api/admin/release-plan-templates');
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const text = query?.toLowerCase();
  const templates = listed.data
    .filter((t) => !text || t.name.toLowerCase().includes(text))
    .map(({ id, name }) => ({ id, name }));
  return { kind: 'release_templates', templates };
};
