import type { Clock } from '../../clock.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import { createEditionReader, type EditionReader } from '../shared/changeRequest.ts';
import { inspectContextField } from './contextField/contextField.ts';
import { inspectFlag } from './flag/flag.ts';
import { inspectFlagExposureMetrics } from './flagExposureMetrics/flagExposureMetrics.ts';
import type { InspectInput, Query } from './inspectInput.ts';
import type { InspectOutput, InspectResult } from './inspectOutput.ts';
import { inspectLifecycleStages } from './lifecycleStages/lifecycleStages.ts';
import { inspectProject } from './project/project.ts';
import { inspectReleaseTemplate } from './releaseTemplate/releaseTemplate.ts';
import { inspectSegment } from './segment/segment.ts';

// Queries are independent, so they run together and each one answers its HTTP failures on its own.
export const createInspect = (unleash: UnleashClient, now: Clock) => {
  const editionOf = createEditionReader(unleash);
  return async ({ queries }: InspectInput): Promise<InspectOutput> => ({
    results: await Promise.all(queries.map((query) => inspect(unleash, editionOf, now, query))),
  });
};

const inspect = (
  unleash: UnleashClient,
  editionOf: EditionReader,
  now: Clock,
  query: Query,
): Promise<InspectResult> => {
  switch (query.kind) {
    case 'project':
      return inspectProject(unleash, query);
    case 'flag':
      return inspectFlag(unleash, editionOf, now, query);
    case 'context_field':
      return inspectContextField(unleash, query);
    case 'segment':
      return inspectSegment(unleash, query);
    case 'flag_exposure_metrics':
      return inspectFlagExposureMetrics(unleash, query);
    case 'release_template':
      return inspectReleaseTemplate(unleash, query);
    case 'lifecycle_stages':
      return inspectLifecycleStages(unleash);
  }
};
