import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../../../unleash/testClient.ts';
import { unleashError } from '../../../unleash/testError.ts';
import { inspectFlagExposureMetrics } from './flagExposureMetrics.ts';

// Exposure metrics are not recorded: Unleash stores SDK reports on a schedule, into buckets of the time they arrive, so
// a snapshot could not replay what a recording saw. Tests answer as Unleash does: one row per application and bucket.
const project = 'default';
const flag = 'mcp-flag';
const environment = 'production';
const rawPath = `/api/admin/client-metrics/features/${flag}/raw`;
const query = { kind: 'flag_exposure_metrics' as const, project, flag, environment, hoursBack: 48 };

type Counts = { yes: number; no: number; variants?: Record<string, number> };
const row = (appName: string, timestamp: string | number, { yes, no, variants }: Counts, env = environment) => ({
  featureName: flag,
  appName,
  environment: env,
  timestamp,
  yes,
  no,
  ...(variants ? { variants } : {}),
});

const stubbed = (hoursBack: number, data: object[]) => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: `${rawPath}?hoursBack=${hoursBack}`, method: 'GET' }).reply(200, { data });
  return unleash;
};

// Two applications over two hours, the later hour first and once as a number, as the spec allows; the web application
// reports the evaluations that got no variant as `disabled`, as SDKs do.
const hourly = [
  row('worker', Date.UTC(2026, 10, 4, 15), { yes: 3, no: 2, variants: { blue: 3 } }),
  row('web', '2026-11-04T14:00:00.000Z', { yes: 0, no: 0 }),
  row('web', '2026-11-04T15:00:00.000Z', { yes: 7, no: 3, variants: { blue: 4, green: 3, disabled: 3 } }),
  row('web', '2026-11-04T15:00:00.000Z', { yes: 5, no: 0, variants: { blue: 5 } }, 'development'),
];

test('sums the evaluations of every application in the environment over the window, variants included', async () => {
  const output = await inspectFlagExposureMetrics(stubbed(48, hourly), query);

  assert.deepEqual(output, {
    kind: 'flag_exposure_metrics',
    flag,
    environment,
    url: `https://unleash.example/projects/${project}/features/${flag}/metrics?environment=${environment}&hoursBack=48`,
    totals: { requests: 15, enabled: 10, variants: { blue: 7, green: 3 } },
  });
});

test('lists the window per hour, summed over the applications, when the series is included', async () => {
  const output = await inspectFlagExposureMetrics(stubbed(48, hourly), { ...query, include: ['series'] });

  assert(output.kind === 'flag_exposure_metrics');
  assert.deepEqual(output.series, [
    { at: '2026-11-04T14:00Z', requests: 0, enabled: 0 },
    { at: '2026-11-04T15:00Z', requests: 15, enabled: 10, variants: { blue: 7, green: 3 } },
  ]);
});

test('lists the window per UTC day beyond 48 hours', async () => {
  const unleash = stubbed(168, [
    row('web', '2026-11-03T00:00:00.000Z', { yes: 100, no: 50 }),
    row('web', '2026-11-04T00:00:00.000Z', { yes: 40, no: 0 }),
  ]);

  const output = await inspectFlagExposureMetrics(unleash, { ...query, hoursBack: 168, include: ['series'] });

  assert(output.kind === 'flag_exposure_metrics');
  assert.deepEqual(output.series, [
    { at: '2026-11-03', requests: 150, enabled: 100 },
    { at: '2026-11-04', requests: 40, enabled: 40 },
  ]);
});

test('answers all zero when no SDK reported in the environment', async () => {
  const output = await inspectFlagExposureMetrics(stubbed(6, []), { ...query, hoursBack: 6 });

  assert.partialDeepStrictEqual(output, {
    url: `https://unleash.example/projects/${project}/features/${flag}/metrics?environment=${environment}&hoursBack=6`,
  });
  assert(output.kind === 'flag_exposure_metrics');
  assert.deepEqual(output.totals, { requests: 0, enabled: 0 });
});

test("reports Unleash's error", async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: `${rawPath}?hoursBack=48`, method: 'GET' })
    .reply(404, unleashError('NotFoundError', 'No flag'));

  const output = await inspectFlagExposureMetrics(unleash, query);

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['No flag'] });
});
