import { describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import type {
  GetTopImpressionEventsParams,
  TopImpressionEventsResponse,
  TopImpressionEventsRow,
  UnleashClient,
} from '../unleash/client.js';
import { getTopImpressionEvents } from './getTopImpressionEvents.js';

interface CallContext {
  context: ServerContext;
  client: { getTopImpressionEvents: ReturnType<typeof vi.fn> };
  logger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

function makeRow(overrides: Partial<TopImpressionEventsRow> = {}): TopImpressionEventsRow {
  return { key: 'new-checkout', count: 1248, ...overrides };
}

function makeContext(
  clientResponse: TopImpressionEventsResponse | Error = {
    groupBy: 'featureName',
    rows: [makeRow()],
  },
): CallContext {
  const getTopImpressionEventsMock = vi.fn(async (_params: GetTopImpressionEventsParams) => {
    if (clientResponse instanceof Error) {
      throw clientResponse;
    }
    return clientResponse;
  });

  const client = { getTopImpressionEvents: getTopImpressionEventsMock };

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
  groupBy: 'featureName' as const,
};

describe('get_top_impression_events tool', () => {
  it('returns ranked rows with totals when the API responds with data', async () => {
    const { context, client } = makeContext({
      groupBy: 'featureName',
      rows: [
        makeRow({ key: 'new-checkout', count: 1248 }),
        makeRow({ key: 'maintenance-banner', count: 26 }),
      ],
    });

    const result = await getTopImpressionEvents(context, baseArgs);

    expect(result.isError).toBeFalsy();
    expect(client.getTopImpressionEvents).toHaveBeenCalledWith({
      from: baseArgs.from,
      to: baseArgs.to,
      groupBy: 'featureName',
      featureName: undefined,
      eventName: undefined,
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
    expect(text).toContain('Top 2 featureName values');
    expect(text).toContain('1274 total events');
    expect(text).toContain('1. new-checkout — 1248');
    expect(text).toContain('2. maintenance-banner — 26');

    const structured = result.structuredContent as {
      success: boolean;
      groupBy: string;
      rowCount: number;
      totalCount: number;
      query: { groupBy: string; limit: number };
    };
    expect(structured.success).toBe(true);
    expect(structured.groupBy).toBe('featureName');
    expect(structured.rowCount).toBe(2);
    expect(structured.totalCount).toBe(1274);
    expect(structured.query.groupBy).toBe('featureName');
    expect(structured.query.limit).toBe(20);
  });

  it('forwards all supported filters to the client', async () => {
    const { context, client } = makeContext({ groupBy: 'variant', rows: [] });

    await getTopImpressionEvents(context, {
      ...baseArgs,
      groupBy: 'variant',
      featureName: 'new-checkout',
      eventName: 'purchase',
      variant: 'treatment',
      enabled: true,
      userId: 'demo-user-456',
      sessionId: '106534282',
      environment: 'production',
      appName: 'simple-usage-example',
      project: 'default',
      limit: 50,
    });

    expect(client.getTopImpressionEvents).toHaveBeenCalledWith({
      from: baseArgs.from,
      to: baseArgs.to,
      groupBy: 'variant',
      featureName: 'new-checkout',
      eventName: 'purchase',
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

  it('handles an empty result set gracefully', async () => {
    const { context } = makeContext({ groupBy: 'userId', rows: [] });

    const result = await getTopImpressionEvents(context, { ...baseArgs, groupBy: 'userId' });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Top 0 userId values');
    expect(text).toContain('0 total events');
    expect(text).toContain('No events matched the query.');
    expect(result.isError).toBeFalsy();
  });

  it('rejects a window longer than 31 days', async () => {
    const { context, client } = makeContext();

    const result = await getTopImpressionEvents(context, {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-15T00:00:00.000Z',
      groupBy: 'featureName',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('31 days');
    expect(client.getTopImpressionEvents).not.toHaveBeenCalled();
  });

  it('rejects when `to` is earlier than `from`', async () => {
    const { context, client } = makeContext();

    const result = await getTopImpressionEvents(context, {
      from: '2026-04-02T00:00:00.000Z',
      to: '2026-04-01T00:00:00.000Z',
      groupBy: 'featureName',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain(
      '`to` must be greater than or equal to `from`',
    );
    expect(client.getTopImpressionEvents).not.toHaveBeenCalled();
  });

  it('rejects an invalid groupBy value', async () => {
    const { context, client } = makeContext();

    const result = await getTopImpressionEvents(context, { ...baseArgs, groupBy: 'flagName' });

    expect(result.isError).toBe(true);
    expect(client.getTopImpressionEvents).not.toHaveBeenCalled();
  });

  it('rejects a limit outside the 1-100 range', async () => {
    const { context, client } = makeContext();

    const result = await getTopImpressionEvents(context, { ...baseArgs, limit: 500 });

    expect(result.isError).toBe(true);
    expect(client.getTopImpressionEvents).not.toHaveBeenCalled();
  });

  it('propagates client errors via handleToolError', async () => {
    const failure = Object.assign(new Error('boom'), { code: 'HTTP_403' });
    const { context, logger } = makeContext(failure);

    const result = await getTopImpressionEvents(context, baseArgs);

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
