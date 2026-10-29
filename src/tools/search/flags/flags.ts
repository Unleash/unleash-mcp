import type { components } from '../../../unleash/api.d.ts';
import type { UnleashClient } from '../../../unleash/client.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import { toFlagState } from '../../shared/flagState.ts';
import { toLifecycleStage, toUnleashStage } from '../../shared/lifecycleStage.ts';
import { toUnleashStaleness } from '../../shared/staleness.ts';
import type { FlagsQuery, Match } from '../searchInput.ts';
import type { Flags } from '../searchOutput.ts';

type UnleashFlag = components['schemas']['featureSearchResponseSchema'];

// Unleash matches, filters and pages on its side, so large instances stay cheap to read; the rows
// drop what the search computes per flag (strategies, variants, plans) and keep the summary.
export const searchFlags = async (
  unleash: UnleashClient,
  { project, query, stages, staleness, segments, tags, createdBy, createdAt, offset, limit }: FlagsQuery,
): Promise<Flags | Failed> => {
  const found = await unleash.GET('/api/admin/search/features', {
    params: {
      query: {
        ...(project ? { project: `IS:${project}` } : {}),
        ...(query ? { query } : {}),
        ...(stages ? { lifecycle: `IS_ANY_OF:${stages.map(toUnleashStage).join(',')}` } : {}),
        ...(staleness ? { state: `IS_ANY_OF:${staleness.map(toUnleashStaleness).join(',')}` } : {}),
        ...(segments ? { segment: `${toOperator[segments.match]}:${segments.of.join(',')}` } : {}),
        ...(tags
          ? { tag: `${toOperator[tags.match]}:${tags.of.map(({ type, value }) => `${type}:${value}`).join(',')}` }
          : {}),
        ...(createdBy
          ? { createdBy: `${createdBy.match === 'any' ? 'IS_ANY_OF' : 'IS_NONE_OF'}:${createdBy.of.join(',')}` }
          : {}),
        ...(createdAt
          ? { createdAt: `${createdAt.match === 'before' ? 'IS_BEFORE' : 'IS_ON_OR_AFTER'}:${createdAt.date}` }
          : {}),
        offset: String(offset),
        limit: String(limit),
      },
    },
  });
  if (!found.response.ok || !found.data) return toFailed(found);
  return {
    kind: 'flags',
    total: found.data.total ?? found.data.features.length,
    flags: found.data.features.map(toFlag),
  };
};

const toOperator: Record<Match, string> = {
  any: 'INCLUDE_ANY_OF',
  all: 'INCLUDE_ALL_OF',
  none: 'EXCLUDE_IF_ANY_OF',
  notAll: 'EXCLUDE_ALL',
};

const toFlag = ({ name, project, type, lifecycle, createdAt, createdBy, tags, environments }: UnleashFlag) => ({
  name,
  project,
  type,
  ...(lifecycle ? { stage: toLifecycleStage(lifecycle.stage) } : {}),
  ...(createdAt ? { createdAt } : {}),
  ...(createdBy?.name ? { createdBy: createdBy.name } : {}),
  ...(tags?.length ? { tags: tags.map(({ type, value }) => ({ type, value })) } : {}),
  environments: environments.map(({ name, enabled, lastSeenAt }) => ({
    name,
    state: toFlagState(enabled),
    ...(lastSeenAt ? { lastSeenAt } : {}),
  })),
});
