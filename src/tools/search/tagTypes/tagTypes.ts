import type { UnleashClient } from '../../../unleash/client.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import type { TagTypesQuery } from '../searchInput.ts';
import type { TagTypes } from '../searchOutput.ts';

// Unleash lists tag types without a filter, so the query is applied here. Icon and colour are left out: an agent doesn't act on them.
export const searchTagTypes = async (unleash: UnleashClient, { query }: TagTypesQuery): Promise<TagTypes | Failed> => {
  const listed = await unleash.GET('/api/admin/tag-types');
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const text = query?.toLowerCase();
  const tagTypes = listed.data.tagTypes
    .filter((t) => !text || t.name.toLowerCase().includes(text))
    .map(({ name, description, valueCount, usedInProjects }) => ({
      name,
      ...(description ? { description } : {}),
      valueCount: valueCount ?? 0,
      usedInProjects: usedInProjects ?? 0,
    }));
  return { kind: 'tag_types', tagTypes };
};
