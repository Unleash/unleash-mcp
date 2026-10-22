import type { UnleashClient } from '../../unleash/client.ts';
import type { Query, InspectInput } from './inspectInput.ts';
import type { InspectOutput, InspectResult } from './inspectOutput.ts';
import { inspectProject } from './project/project.ts';
import { inspectFlag } from './flag/flag.ts';
import { inspectContextField } from './contextField/contextField.ts';
import { inspectSegment } from './segment/segment.ts';

// Queries are independent, so they run together and each one answers its HTTP failures on its own.
export const createInspect =
  (unleash: UnleashClient) =>
    async ({ queries }: InspectInput): Promise<InspectOutput> => ({ results: await Promise.all(queries.map((query) => inspect(unleash, query))) });

const inspect = (unleash: UnleashClient, query: Query): Promise<InspectResult> => {
  switch (query.kind) {
    case 'project': return inspectProject(unleash, query);
    case 'flag': return inspectFlag(unleash, query);
    case 'context_field': return inspectContextField(unleash, query);
    case 'segment': return inspectSegment(unleash, query);
  }
};
