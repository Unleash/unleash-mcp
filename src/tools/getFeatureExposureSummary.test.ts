import { describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import type {
  FeatureExposureSummaryResponse,
  FeatureExposureSummaryRow,
  GetFeatureExposureSummaryParams,
  UnleashClient,
} from '../unleash/client.js';
import { getFeatureExposureSummary } from './getFeatureExposureSummary.js';

interface CallContext {
  context: ServerContext;
  client: { getFeatureExposureSummary: ReturnType<typeof vi.fn> };
  logger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

function makeRow(overrides: Partial<FeatureExposureSummaryRow> = {}): FeatureExposureSummaryRow {
  return {
    featureName: 'new-checkout',
    variant: 'treatment',
    enabled: true,
    exposures: 42,
    distinctUsers: 10,
    distinctSessions: 15,
    ...overrides,
  };
}

function makeContext(
  clientResponse: FeatureExposureSummaryResponse | Error = { rows: [makeRow()] },
): CallContext {
  const getFeatureExposureSummaryMock = vi.fn(
    async (_params: GetFeatureExposureSummaryParams) => {
      if (clientResponse instanceof Error) {
        throw clientResponse;
      }
      return clientResponse;
    },
  );

  const client = { getFeatureExposureSummary: getFeatureExposureSummaryMock };

  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const context = {
    config: {
      unleash: { baseUrl: 'http://localhost:4242', pat: '' },
      server: { dryRun: false, logLevel: 'error' },
    },
    unleashClient: client as unknown as UnleashClient,
    logger,
    cache: { projects: null, featureFlags: new Map() },
    notifyProgress: vi.fn(async () => {}),
  } as unknown as ServerContext;

  return { context, client, logger };
}

const baseArgs = {
  from: '2026-04-01T00:00:00.000Z',
  to: '2026-04-02T00:00:00.000Z',
};

describe('get_feature_exposure_summary tool', () => {
  it('returns summary rows with totals when the API responds with data', async () => {
    const { context, client } = makeContext({
      rows: [makeRow(), makeRow({ variant: 'control', exposures: 58, distinctUsers: 12 })],
    });

    const result = await getFeatureExposureSummary(context, {
      ...baseArgs,
      featureName: 'new-checkout',
    });

    expect(result.isError).toBeFalsy();
    expect(client.getFeatureExposureSummary).toHaveBeenCalledWith({
      from: baseArgs.from,
      to: baseArgs.to,
      bucket: undefined,
      featureName: 'new-checkout',
      variant: undefined,
      enabled: undefined,
      userId: undefined,
      sessionId: undefined,
      environment: undefined,
      appName: undefined,
      project: undefined,
      limit: undefined,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Found 2 summary rows');
    expect(text).toContain('100 total exposures');
    expect(text).toContain('new-checkout');
    expect(text).toContain('variant=treatment');
    expect(text).toContain('variant=control');

    const structured = result.structuredContent as {
      success: boolean;
      rowCount: number;
      totalExposures: number;
      query: { bucket: string; limit: number };
    };
    expect(structured.success).toBe(true);
    expect(structured.rowCount).toBe(2);
    expect(structured.totalExposures).toBe(100);
    expect(structured.query.bucket).toBe('none');
    expect(structured.query.limit).toBe(100);
  });

  it('forwards all supported filters including bucket to the client', async () => {
    const { context, client } = makeContext({ rows: [] });

    await getFeatureExposureSummary(context, {
      ...baseArgs,
      bucket: 'hour',
      featureName: 'new-checkout',
      variant: 'treatment',
      enabled: true,
      userId: 'demo-user-456',
      sessionId: '106534282',
      environment: 'production',
      appName: 'simple-usage-example',
      project: 'default',
      limit: 50,
    });

    expect(client.getFeatureExposureSummary).toHaveBeenCalledWith({
      from: baseArgs.from,
      to: baseArgs.to,
      bucket: 'hour',
      featureName: 'new-checkout',
      variant: 'treatment',
      enabled: true,
      userId: 'demo-user-456',
      sessionId: '106534282',
      environment: 'production',
      appName: 'simple-usage-example',
      project: 'default',
      limit: 50,
    });
  });

  it('renders the bucket prefix in the summary when bucket=day', async () => {
    const { context } = makeContext({
      rows: [makeRow({ bucket: '2026-04-01T00:00:00.000Z' })],
    });

    const result = await getFeatureExposureSummary(context, { ...baseArgs, bucket: 'day' });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('2026-04-01T00:00:00.000Z');
    expect(text).toContain('new-checkout');
  });

  it('handles an empty result set gracefully', async () => {
    const { context } = makeContext({ rows: [] });

    const result = await getFeatureExposureSummary(context, baseArgs);

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Found 0 summary rows');
    expect(text).toContain('0 total exposures');
    expect(text).toContain('No exposures matched the query.');
    expect(result.isError).toBeFalsy();
  });

  it('rejects a window longer than 31 days', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureExposureSummary(context, {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-15T00:00:00.000Z',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('31 days');
    expect(client.getFeatureExposureSummary).not.toHaveBeenCalled();
  });

  it('rejects when `to` is earlier than `from`', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureExposureSummary(context, {
      from: '2026-04-02T00:00:00.000Z',
      to: '2026-04-01T00:00:00.000Z',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain(
      '`to` must be greater than or equal to `from`',
    );
    expect(client.getFeatureExposureSummary).not.toHaveBeenCalled();
  });

  it('rejects an invalid bucket value', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureExposureSummary(context, { ...baseArgs, bucket: 'week' });

    expect(result.isError).toBe(true);
    expect(client.getFeatureExposureSummary).not.toHaveBeenCalled();
  });

  it('propagates client errors via handleToolError', async () => {
    const failure = Object.assign(new Error('boom'), { code: 'HTTP_403' });
    const { context, logger } = makeContext(failure);

    const result = await getFeatureExposureSummary(context, baseArgs);

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('boom');
    expect(logger.error).toHaveBeenCalled();
    const structured = result.structuredContent as {
      success: boolean;
      error: { code: string };
    };
    expect(structured.success).toBe(false);
    expect(structured.error.code).toBe('HTTP_403');
  });
});
