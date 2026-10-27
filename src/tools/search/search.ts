import type { UnleashClient } from '../../unleash/client.ts';
import type { Query, SearchInput } from './searchInput.ts';
import type { SearchOutput, SearchResult } from './searchOutput.ts';
import { searchProjects } from './projects/projects.ts';
import { searchFlags } from './flags/flags.ts';
import { searchSegments } from './segments/segments.ts';
import { searchContextFields } from './contextFields/contextFields.ts';
import { searchTagTypes } from './tagTypes/tagTypes.ts';
import { searchTags } from './tags/tags.ts';
import { searchFlagCreators } from './flagCreators/flagCreators.ts';
import { searchReleaseTemplates } from './releaseTemplates/releaseTemplates.ts';
import { searchEventTypes } from './eventTypes/eventTypes.ts';
import { searchEnvironments } from './environments/environments.ts';

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
    case 'tag_types': return searchTagTypes(unleash, query);
    case 'tags': return searchTags(unleash, query);
    case 'flag_creators': return searchFlagCreators(unleash, query);
    case 'release_templates': return searchReleaseTemplates(unleash, query);
    case 'event_types': return Promise.resolve(searchEventTypes(query));
    case 'environments': return searchEnvironments(unleash, query);
  }
};
