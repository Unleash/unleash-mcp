import type { UnleashClient } from '../../../unleash/client.ts';
import type { TagsQuery } from '../searchInput.ts';
import type { Tags } from '../searchOutput.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';

// Unleash lists tags by type or all at once, with no filter on the value, so the query is applied here.
export const searchTags = async (unleash: UnleashClient, { type, query }: TagsQuery): Promise<Tags | Failed> => {
  const listed = type
    ? await unleash.GET('/api/admin/tags/{type}', { params: { path: { type } } })
    : await unleash.GET('/api/admin/tags');
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const text = query?.toLowerCase();
  const tags = listed.data.tags
    .filter((t) => !text || t.value.toLowerCase().includes(text))
    .map(({ type, value }) => ({ type, value }));
  return { kind: 'tags', tags };
};
