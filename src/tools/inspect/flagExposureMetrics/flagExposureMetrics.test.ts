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

const row = (appName: string, timestamp: string, yes: number, no: number, env = environment) => ({
  featureName: flag,
  appName,
  environment: env,
  timestamp,
  yes,
  no,
});

const stubbed = (hoursBack: number, data: object[]) => {
  const { unleash, stub } = createStubbedClient();
  stub.intercept({ path: `${rawPath}?hoursBack=${hoursBack}`, method: 'GET' }).reply(200, { data });
  return unleash;
};

test('sums the evaluations of every application in the environment over the window', async () => {
  const unleash = stubbed(48, [
    row('web', '2026-11-04T14:00:00.000Z', 0, 0),
    row('web', '2026-11-04T15:00:00.000Z', 7, 3),
    row('worker', '2026-11-04T15:00:00.000Z', 3, 2),
    row('web', '2026-11-04T15:00:00.000Z', 5, 0, 'development'),
  ]);

  const output = await inspectFlagExposureMetrics(unleash, query);

  assert.deepEqual(output, {
    kind: 'flag_exposure_metrics',
    flag,
    environment,
    url: `https://unleash.example/projects/${project}/features/${flag}/metrics?environment=${environment}&hoursBack=48`,
    totals: { requests: 15, enabled: 10 },
  });
});

test('answers all zero when no SDK reported in the environment', async () => {
  const output = await inspectFlagExposureMetrics(stubbed(6, []), { ...query, hoursBack: 6 });

  assert.partialDeepStrictEqual(output, {
    url: `https://unleash.example/projects/${project}/features/${flag}/metrics?environment=${environment}&hoursBack=6`,
    totals: { requests: 0, enabled: 0 },
  });
});

test("reports Unleash's error", async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: `${rawPath}?hoursBack=48`, method: 'GET' })
    .reply(404, unleashError('NotFoundError', 'No flag'));

  const output = await inspectFlagExposureMetrics(unleash, query);

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['No flag'] });
});
