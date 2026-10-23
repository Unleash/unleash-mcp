import type { UnleashClient } from '../../unleash/client.ts';
import type { Query, SearchInput } from './searchInput.ts';
import type { SearchOutput, SearchResult } from './searchOutput.ts';
import { searchProjects } from './projects/projects.ts';
import { searchFlags } from './flags/flags.ts';
import { searchSegments } from './segments/segments.ts';
import { searchContextFields } from './contextFields/contextFields.ts';
import { searchFlagCreators } from './flagCreators/flagCreators.ts';

// Queries are independent, so they run together and each one answers its HTTP failures on its own.
export const createSearch =
  (unleash: UnleashClient) =>
    async ({ queries }: SearchInput): Promise<SearchOutput> => ({ results: await Promise.all(queries.map((query) => search(unleash, query))) });

const search = (unleash: UnleashClient, query: Query): Promise<SearchResult> => {
  switch (query.kind) {
    case 'projects': return searchProjects(unleash, query);
    case 'flags': return searchFlags(unleash, query);
    case 'segments': return searchSegments(unleash, query);
    case 'context_fields': return searchContextFields(unleash, query);
    case 'flag_creators': return searchFlagCreators(unleash, query);
  }
};
