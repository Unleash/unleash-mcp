import type { UnleashClient } from '../../unleash/client.ts';
import type { Create } from './flagLifecycleInput.ts';
import type { Outcome } from './flagLifecycleOutput.ts';
import { toFailed } from '../shared/failed.ts';

// Tags go in a second request: the create body only takes tags that already exist, while the tags endpoint
// creates a missing one. One request tags them all. A failure here leaves the flag created, untagged.
/** Creates a flag and tags it, answering Unleash's refusal (e.g. the name is taken) as `failed`. */
export const createFlag = async (unleash: UnleashClient, { project, flag, type, description, tags }: Create): Promise<Outcome> => {
  const created = await unleash.POST('/api/admin/projects/{projectId}/features', { params: { path: { projectId: project } }, body: { name: flag, type, description } });
  if (!created.response.ok) return toFailed(created);
  if (!tags?.length) return { kind: 'applied' };

  const tagged = await unleash.PUT('/api/admin/features/{featureName}/tags', { params: { path: { featureName: flag } }, body: { addedTags: tags, removedTags: [] } });
  if (!tagged.response.ok) return toFailed(tagged);
  return { kind: 'applied' };
};
