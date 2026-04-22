import { describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import type {
  CustomEventRow,
  CustomEventsResponse,
  GetCustomEventsParams,
  UnleashClient,
} from '../unleash/client.js';
import { getCustomEvents } from './getCustomEvents.js';

interface CallContext {
  context: ServerContext;
  client: { getCustomEvents: ReturnType<typeof vi.fn> };
  logger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

function makeRow(overrides: Partial<CustomEventRow> = {}): CustomEventRow {
  return {
    receivedAt: '2026-04-22T14:19:59.000Z',
    timestamp: '2026-04-22T14:19:58.204Z',
    eventId: 'event-1',
    eventName: 'checkout_started',
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
  clientResponse: CustomEventsResponse | Error = { rows: [makeRow()], truncated: false },
): CallContext {
  const getCustomEventsMock = vi.fn(async (_params: GetCustomEventsParams) => {
    if (clientResponse instanceof Error) {
      throw clientResponse;
    }
    return clientResponse;
  });

  const client = { getCustomEvents: getCustomEventsMock };

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

describe('get_custom_events tool', () => {
  it('returns rows and a summary when the API responds with data', async () => {
    const { context, client } = makeContext({
      rows: [
        makeRow(),
        makeRow({ eventId: 'event-2', userId: 'demo-user-789', payload: { cartValue: 120 } }),
      ],
      truncated: false,
    });

    const result = await getCustomEvents(context, {
      ...baseArgs,
      eventName: 'checkout_started',
    });

    expect(result.isError).toBeFalsy();
    expect(client.getCustomEvents).toHaveBeenCalledWith({
      from: baseArgs.from,
      to: baseArgs.to,
      eventName: 'checkout_started',
      userId: undefined,
      sessionId: undefined,
      environment: undefined,
      appName: undefined,
      project: undefined,
      limit: undefined,
      offset: undefined,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Found 2 custom events');
    expect(text).toContain('checkout_started');
    expect(text).toContain('demo-user-456');
    expect(text).toContain('demo-user-789');
    expect(text).toContain('payload={"cartValue":120}');

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

    await getCustomEvents(context, {
      ...baseArgs,
      eventName: 'checkout_started',
      userId: 'demo-user-456',
      sessionId: '106534282',
      environment: 'production',
      appName: 'simple-usage-example',
      project: 'default',
      limit: 50,
      offset: 10,
    });

    expect(client.getCustomEvents).toHaveBeenCalledWith({
      from: baseArgs.from,
      to: baseArgs.to,
      eventName: 'checkout_started',
      userId: 'demo-user-456',
      sessionId: '106534282',
      environment: 'production',
      appName: 'simple-usage-example',
      project: 'default',
      limit: 50,
      offset: 10,
    });
  });

  it('omits payload segment when payload is empty', async () => {
    const { context } = makeContext({ rows: [makeRow({ payload: {} })], truncated: false });

    const result = await getCustomEvents(context, baseArgs);

    const text = (result.content[0] as { text: string }).text;
    expect(text).not.toContain('payload=');
  });

  it('infers truncation when row count reaches the requested limit', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => makeRow({ eventId: `event-${i}` }));
    const { context } = makeContext({ rows, truncated: false });

    const result = await getCustomEvents(context, { ...baseArgs, limit: 3 });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('truncated');
    expect(text).toContain('limit of 3');

    const structured = result.structuredContent as { truncated: boolean };
    expect(structured.truncated).toBe(true);
  });

  it('handles an empty result set gracefully', async () => {
    const { context } = makeContext({ rows: [], truncated: false });

    const result = await getCustomEvents(context, baseArgs);

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Found 0 custom events');
    expect(text).toContain('No custom events matched the query.');
    expect(result.isError).toBeFalsy();
  });

  it('rejects a window longer than 31 days', async () => {
    const { context, client } = makeContext();

    const result = await getCustomEvents(context, {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-15T00:00:00.000Z',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('31 days');
    expect(client.getCustomEvents).not.toHaveBeenCalled();
  });

  it('rejects when `to` is earlier than `from`', async () => {
    const { context, client } = makeContext();

    const result = await getCustomEvents(context, {
      from: '2026-04-02T00:00:00.000Z',
      to: '2026-04-01T00:00:00.000Z',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain(
      '`to` must be greater than or equal to `from`',
    );
    expect(client.getCustomEvents).not.toHaveBeenCalled();
  });

  it('rejects malformed datetime input', async () => {
    const { context, client } = makeContext();

    const result = await getCustomEvents(context, {
      from: 'yesterday',
      to: '2026-04-02T00:00:00.000Z',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Validation failed');
    expect(client.getCustomEvents).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range limit', async () => {
    const { context, client } = makeContext();

    const result = await getCustomEvents(context, { ...baseArgs, limit: 5000 });

    expect(result.isError).toBe(true);
    expect(client.getCustomEvents).not.toHaveBeenCalled();
  });

  it('propagates client errors via handleToolError', async () => {
    const failure = Object.assign(new Error('boom'), { code: 'HTTP_403' });
    const { context, logger } = makeContext(failure);

    const result = await getCustomEvents(context, baseArgs);

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
