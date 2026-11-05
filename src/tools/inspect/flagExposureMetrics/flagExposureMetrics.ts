import type { components } from '../../../unleash/api.d.ts';
import type { UnleashClient } from '../../../unleash/client.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import { flagUrl } from '../../shared/uiUrl.ts';
import type { FlagExposureMetricsQuery } from '../inspectInput.ts';
import type { ExposureBucket, ExposureTotals, FlagExposureMetrics } from '../inspectOutput.ts';

type UnleashMetric = components['schemas']['featureEnvironmentMetricsSchema'];

// Unleash answers one row per application and bucket in the window, every environment included, as the exposure
// metrics page reads it; the page's environment filter and its sums happen here.
export const inspectFlagExposureMetrics = async (
  unleash: UnleashClient,
  { project, flag, environment, hoursBack, include = [] }: FlagExposureMetricsQuery,
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
    ...(include.includes('series') ? { series: toSeries(rows, hoursBack) } : {}),
  };
};

// Unleash buckets by the hour up to 48 hours back and by the UTC day beyond, and sends the bucket's start as ISO text.
const toSeries = (rows: UnleashMetric[], hoursBack: number): ExposureBucket[] =>
  [...new Set(rows.map(startOf))].sort().map((start) => ({
    at: hoursBack > 48 ? start.slice(0, 10) : `${start.slice(0, 16)}Z`,
    ...toTotals(rows.filter((row) => startOf(row) === start)),
  }));

// The spec types the timestamp as a date or a number.
const startOf = (row: UnleashMetric): string => new Date(row.timestamp).toISOString();

const toTotals = (rows: UnleashMetric[]): ExposureTotals => {
  const variants = toVariantCounts(rows);
  return {
    requests: sum(rows, (row) => row.yes + row.no),
    enabled: sum(rows, (row) => row.yes),
    ...(variants ? { variants } : {}),
  };
};

// SDKs count the evaluations that got no variant as `disabled`, which the UI leaves out.
const toVariantCounts = (rows: UnleashMetric[]): Record<string, number> | undefined => {
  const counts: Record<string, number> = {};
  for (const row of rows)
    for (const [variant, count] of Object.entries(row.variants ?? {}))
      if (variant !== 'disabled') counts[variant] = (counts[variant] ?? 0) + count;
  return Object.keys(counts).length > 0 ? counts : undefined;
};

const sum = (rows: UnleashMetric[], of: (row: UnleashMetric) => number): number =>
  rows.reduce((total, row) => total + of(row), 0);
