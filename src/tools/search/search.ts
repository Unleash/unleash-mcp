import type { UnleashClient } from '../../unleash/client.ts';
import type { Query, SearchInput } from './searchInput.ts';
import type { SearchOutput, SearchResult } from './searchOutput.ts';
import { searchProjects } from './projects/projects.ts';
import { searchSegments } from './segments/segments.ts';
import { searchContextFields } from './contextFields/contextFields.ts';

// Queries are independent, so they run together and each one answers its HTTP failures on its own.
export const createSearch =
  (unleash: UnleashClient) =>
    async ({ queries }: SearchInput): Promise<SearchOutput> => ({ results: await Promise.all(queries.map((query) => search(unleash, query))) });

const search = (unleash: UnleashClient, query: Query): Promise<SearchResult> => {
  switch (query.kind) {
    case 'projects': return searchProjects(unleash, query);
    case 'segments': return searchSegments(unleash, query);
    case 'context_fields': return searchContextFields(unleash, query);
  }
};
