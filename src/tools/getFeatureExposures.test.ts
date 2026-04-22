import { describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import type {
  FeatureExposureRow,
  FeatureExposuresResponse,
  GetFeatureExposuresParams,
  UnleashClient,
} from '../unleash/client.js';
import { getFeatureExposures } from './getFeatureExposures.js';

interface CallContext {
  context: ServerContext;
  client: { getFeatureExposures: ReturnType<typeof vi.fn> };
  logger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

function makeRow(overrides: Partial<FeatureExposureRow> = {}): FeatureExposureRow {
  return {
    receivedAt: '2026-04-22T14:19:59.000Z',
    timestamp: '2026-04-22T14:19:58.204Z',
    eventId: 'event-1',
    featureName: 'new-checkout',
    enabled: true,
    variant: 'treatment',
    userId: 'demo-user-456',
    sessionId: '106534282',
    environment: 'production',
    appName: 'simple-usage-example',
    project: 'default',
    payload: {},
    context: {},
    ...overrides,
  };
}

function makeContext(
  clientResponse: FeatureExposuresResponse | Error = { rows: [makeRow()], truncated: false },
): CallContext {
  const getFeatureExposuresMock = vi.fn(async (_params: GetFeatureExposuresParams) => {
    if (clientResponse instanceof Error) {
      throw clientResponse;
    }
    return clientResponse;
  });

  const client = { getFeatureExposures: getFeatureExposuresMock };

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

describe('get_feature_exposures tool', () => {
  it('returns rows and a summary when the API responds with data', async () => {
    const { context, client } = makeContext({
      rows: [makeRow(), makeRow({ userId: 'demo-user-789' })],
      truncated: false,
    });

    const result = await getFeatureExposures(context, { ...baseArgs, featureName: 'new-checkout' });

    expect(result.isError).toBeFalsy();
    expect(client.getFeatureExposures).toHaveBeenCalledWith({
      from: baseArgs.from,
      to: baseArgs.to,
      featureName: 'new-checkout',
      variant: undefined,
      enabled: undefined,
      userId: undefined,
      sessionId: undefined,
      environment: undefined,
      appName: undefined,
      project: undefined,
      limit: undefined,
      offset: undefined,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Found 2 exposure rows');
    expect(text).toContain('new-checkout');
    expect(text).toContain('demo-user-456');
    expect(text).toContain('demo-user-789');

    const structured = result.structuredContent as {
      success: boolean;
      rowCount: number;
      truncated: boolean;
      query: { limit: number; offset: number };
    };
    expect(structured.success).toBe(true);
    expect(structured.rowCount).toBe(2);
    expect(structured.truncated).toBe(false);
    expect(structured.query.limit).toBe(100);
    expect(structured.query.offset).toBe(0);
  });

  it('forwards all supported filters to the client', async () => {
    const { context, client } = makeContext({ rows: [], truncated: false });

    await getFeatureExposures(context, {
      ...baseArgs,
      featureName: 'new-checkout',
      variant: 'treatment',
      enabled: true,
      userId: 'demo-user-456',
      sessionId: '106534282',
      environment: 'production',
      appName: 'simple-usage-example',
      project: 'default',
      limit: 50,
      offset: 10,
    });

    expect(client.getFeatureExposures).toHaveBeenCalledWith({
      from: baseArgs.from,
      to: baseArgs.to,
      featureName: 'new-checkout',
      variant: 'treatment',
      enabled: true,
      userId: 'demo-user-456',
      sessionId: '106534282',
      environment: 'production',
      appName: 'simple-usage-example',
      project: 'default',
      limit: 50,
      offset: 10,
    });
  });

  it('allows variant without featureName (API does not require it)', async () => {
    const { context, client } = makeContext({ rows: [], truncated: false });

    const result = await getFeatureExposures(context, { ...baseArgs, variant: 'treatment' });

    expect(result.isError).toBeFalsy();
    expect(client.getFeatureExposures).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'treatment', featureName: undefined }),
    );
  });

  it('reports truncation in the summary when the API hits the limit', async () => {
    const { context } = makeContext({ rows: [makeRow()], truncated: true });

    const result = await getFeatureExposures(context, { ...baseArgs, limit: 1 });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('truncated');
    expect(text).toContain('limit of 1');
  });

  it('handles an empty result set gracefully', async () => {
    const { context } = makeContext({ rows: [], truncated: false });

    const result = await getFeatureExposures(context, baseArgs);

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Found 0 exposure rows');
    expect(text).toContain('No exposures matched the query.');
    expect(result.isError).toBeFalsy();
  });

  it('rejects a window longer than 31 days', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureExposures(context, {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-15T00:00:00.000Z',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('31 days');
    expect(client.getFeatureExposures).not.toHaveBeenCalled();
  });

  it('rejects when `to` is earlier than `from`', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureExposures(context, {
      from: '2026-04-02T00:00:00.000Z',
      to: '2026-04-01T00:00:00.000Z',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain(
      '`to` must be greater than or equal to `from`',
    );
    expect(client.getFeatureExposures).not.toHaveBeenCalled();
  });

  it('rejects malformed datetime input', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureExposures(context, {
      from: 'yesterday',
      to: '2026-04-02T00:00:00.000Z',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Validation failed');
    expect(client.getFeatureExposures).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range limit', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureExposures(context, { ...baseArgs, limit: 5000 });

    expect(result.isError).toBe(true);
    expect(client.getFeatureExposures).not.toHaveBeenCalled();
  });

  it('propagates client errors via handleToolError', async () => {
    const failure = Object.assign(new Error('boom'), { code: 'HTTP_403' });
    const { context, logger } = makeContext(failure);

    const result = await getFeatureExposures(context, baseArgs);

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
