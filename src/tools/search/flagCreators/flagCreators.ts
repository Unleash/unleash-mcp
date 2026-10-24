import type { UnleashClient } from '../../../unleash/client.ts';
import type { FlagCreatorsQuery } from '../searchInput.ts';
import type { FlagCreators } from '../searchOutput.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';

// Unleash matches and pages the creators itself: an instance can have tens of thousands of users.
export const searchFlagCreators = async (unleash: UnleashClient, { query, offset, limit }: FlagCreatorsQuery): Promise<FlagCreators | Failed> => {
  const listed = await unleash.GET('/api/admin/flag-creators', {
    params: { query: { ...(query ? { q: query } : {}), offset: String(offset), limit: String(limit) } },
  });
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  return { kind: 'flag_creators', total: listed.data.total, creators: listed.data.flagCreators.map(({ id, name }) => ({ id, name })) };
};
