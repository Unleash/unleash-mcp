import type { components } from '../../../unleash/api.d.ts';
import type { UnleashClient } from '../../../unleash/client.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import { flagUrl } from '../../shared/uiUrl.ts';
import type { FlagExposureMetricsQuery } from '../inspectInput.ts';
import type { ExposureTotals, FlagExposureMetrics } from '../inspectOutput.ts';

type UnleashMetric = components['schemas']['featureEnvironmentMetricsSchema'];

// Unleash answers one row per application and bucket in the window, every environment included, as the exposure
// metrics page reads it; the page's environment filter and its sums happen here.
export const inspectFlagExposureMetrics = async (
  unleash: UnleashClient,
  { project, flag, environment, hoursBack }: FlagExposureMetricsQuery,
): Promise<FlagExposureMetrics | Failed> => {
  const found = await unleash.GET('/api/admin/client-metrics/features/{name}/raw', {
    params: { path: { name: flag } },
    // The OpenAPI spec leaves `hoursBack` out; without it Unleash answers the last 24 hours.
    querySerializer: () => `hoursBack=${hoursBack}`,
  });
  if (!found.response.ok || !found.data) return toFailed(found);
  const rows = found.data.data.filter((row) => row.environment === environment);
  return {
    kind: 'flag_exposure_metrics',
    flag,
    environment,
    url: `${flagUrl(unleash, project, flag)}/metrics?environment=${encodeURIComponent(environment)}&hoursBack=${hoursBack}`,
    totals: toTotals(rows),
  };
};

const toTotals = (rows: UnleashMetric[]): ExposureTotals => ({
  requests: sum(rows, (row) => row.yes + row.no),
  enabled: sum(rows, (row) => row.yes),
});

const sum = (rows: UnleashMetric[], of: (row: UnleashMetric) => number): number =>
  rows.reduce((total, row) => total + of(row), 0);
