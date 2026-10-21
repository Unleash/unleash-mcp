import type { UnleashClient } from '../unleash/client.ts';
import type { SearchInput } from './searchInput.ts';
import type { SearchOutput } from './searchOutput.ts';

// Not registered yet: the search tool is being designed. The spike lives in searchSpike.ts.
export const createSearch =
  (_unleash: UnleashClient) =>
    async (_input: SearchInput): Promise<SearchOutput> => ({});
