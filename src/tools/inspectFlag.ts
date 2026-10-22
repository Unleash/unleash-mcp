import type { UnleashClient } from '../unleash/client.ts';
import type { FlagQuery } from './inspectInput.ts';
import type { FlagType, InspectResult, Link, Parent, Tag } from './inspectOutput.ts';
import { toFailed } from './failed.ts';

export const inspectFlag = async (unleash: UnleashClient, { project, flag }: FlagQuery): Promise<InspectResult> => {
  // The flag endpoint leaves the tags out, so they take a request of their own.
  const [found, tagged] = await Promise.all([
    unleash.GET('/api/admin/projects/{projectId}/features/{featureName}', { params: { path: { projectId: project, featureName: flag } } }),
    unleash.GET('/api/admin/features/{featureName}/tags', { params: { path: { featureName: flag } } }),
  ]);
  if (!found.response.ok || !found.data) return toFailed(found);
  if (!tagged.response.ok || !tagged.data) return toFailed(tagged);
  const { name, type, createdAt, createdBy, collaborators, dependencies, links } = found.data;
  const tags = tagged.data.tags;
  const collaboratorNames = collaborators?.users.map((user) => user.name) ?? [];
  return {
    kind: 'flag',
    name,
    type: type as FlagType,
    ...(createdAt ? { createdAt } : {}),
    ...(createdBy ? { createdBy: createdBy.name } : {}),
    ...(collaboratorNames.length ? { collaborators: collaboratorNames } : {}),
    ...(dependencies?.[0] ? { parent: toParent(dependencies[0]) } : {}),
    ...(tags?.length ? { tags: tags.map(toTag) } : {}),
    ...(links?.length ? { links: links.map(toLink) } : {}),
  };
};

// Unleash allows one parent per flag; its schema is an array anyway.
const toParent = ({ feature, enabled, variants }: { feature: string; enabled?: boolean; variants?: string[] }): Parent => ({
  flag: feature,
  ...(enabled === false ? { enabled } : {}),
  ...(variants?.length ? { variants } : {}),
});

const toTag = ({ type, value }: Tag): Tag => ({ type, value });

const toLink = ({ url, title }: { url: string; title?: string | null }): Link => ({ url, ...(title ? { title } : {}) });
