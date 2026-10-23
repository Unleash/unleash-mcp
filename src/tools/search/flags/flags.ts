import type { components } from '../../../unleash/api.d.ts';
import type { UnleashClient } from '../../../unleash/client.ts';
import type { FlagsQuery } from '../searchInput.ts';
import type { Flags } from '../searchOutput.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import { toLifecycleStage, toUnleashStage } from '../../shared/lifecycleStage.ts';

type UnleashFlag = components['schemas']['featureSearchResponseSchema'];

// Unleash matches, filters and pages on its side, so large instances stay cheap to read; the rows
// drop what the search computes per flag (strategies, variants, plans) and keep the summary.
export const searchFlags = async (unleash: UnleashClient, { project, query, stages, offset, limit }: FlagsQuery): Promise<Flags | Failed> => {
  const found = await unleash.GET('/api/admin/search/features', {
    params: {
      query: {
        ...(project ? { project: `IS:${project}` } : {}),
        ...(query ? { query } : {}),
        ...(stages ? { lifecycle: `IS_ANY_OF:${stages.map(toUnleashStage).join(',')}` } : {}),
        offset: String(offset),
        limit: String(limit),
      },
    },
  });
  if (!found.response.ok || !found.data) return toFailed(found);
  return { kind: 'flags', total: found.data.total ?? found.data.features.length, flags: found.data.features.map(toFlag) };
};

const toFlag = ({ name, project, type, lifecycle, createdAt, createdBy, tags, environments }: UnleashFlag) => ({
  name,
  project,
  type,
  ...(lifecycle ? { stage: toLifecycleStage(lifecycle.stage) } : {}),
  ...(createdAt ? { createdAt } : {}),
  ...(createdBy?.name ? { createdBy: createdBy.name } : {}),
  ...(tags?.length ? { tags: tags.map(({ type, value }) => ({ type, value })) } : {}),
  environments: environments.map(({ name, enabled, lastSeenAt }) => ({ name, enabled, ...(lastSeenAt ? { lastSeenAt } : {}) })),
});
