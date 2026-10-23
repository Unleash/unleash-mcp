import type { UnleashClient } from '../../unleash/client.ts';
import type { Create } from './flagLifecycleInput.ts';
import type { Outcome } from './flagLifecycleOutput.ts';
import { toFailed } from '../shared/failed.ts';

const features = '/api/admin/projects/{projectId}/features';
const tagsOf = '/api/admin/features/{featureName}/tags';
const linksOf = '/api/admin/projects/{projectId}/features/{featureName}/link';

// Tags and links each take their own request after the create: the create body only takes tags that already
// exist, while the tags endpoint creates a missing one; links have no place on it. A failure among them leaves
// the flag created without the rest, which the input schema tells the agent.
/** Creates a flag with its tags and links, answering Unleash's refusal (e.g. the name is taken) as `failed`. */
export const createFlag = async (unleash: UnleashClient, { project, flag, type, description, tags, links }: Create): Promise<Outcome> => {
  const created = await unleash.POST(features, { params: { path: { projectId: project } }, body: { name: flag, type, description } });
  if (!created.response.ok) return toFailed(created);

  if (tags?.length) {
    const tagged = await unleash.PUT(tagsOf, { params: { path: { featureName: flag } }, body: { addedTags: tags, removedTags: [] } });
    if (!tagged.response.ok) return toFailed(tagged);
  }
  for (const link of links ?? []) {
    const linked = await unleash.POST(linksOf, { params: { path: { projectId: project, featureName: flag } }, body: link });
    if (!linked.response.ok) return toFailed(linked);
  }
  return { kind: 'applied' };
};
