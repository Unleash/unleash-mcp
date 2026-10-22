import type { UnleashClient } from '../unleash/client.ts';
import type { Query, SearchInput } from './searchInput.ts';
import type { SearchOutput, SearchResult } from './searchOutput.ts';
import { searchProject } from './project.ts';

// Queries are independent, so they run together and each one answers its HTTP failures on its own.
export const createSearch =
  (unleash: UnleashClient) =>
    async ({ queries }: SearchInput): Promise<SearchOutput> => ({ results: await Promise.all(queries.map((query) => search(unleash, query))) });

const search = (unleash: UnleashClient, query: Query): Promise<SearchResult> => {
  switch (query.kind) {
    case 'project': return searchProject(unleash, query);
  }
};
