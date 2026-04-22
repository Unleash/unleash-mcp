import { describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import type {
  AttributionResponse,
  AttributionRow,
  GetAttributionParams,
  UnleashClient,
} from '../unleash/client.js';
import { getFeatureAttribution } from './getFeatureAttribution.js';

interface CallContext {
  context: ServerContext;
  client: { getAttribution: ReturnType<typeof vi.fn> };
  logger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

function makeRow(overrides: Partial<AttributionRow> = {}): AttributionRow {
  return {
    variant: 'treatment',
    exposedUsers: 120,
    convertedUsers: 36,
    conversionRate: 0.3,
    avgTimeToConvertSec: 142,
    ...overrides,
  };
}

function makeContext(
  clientResponse: AttributionResponse | Error = {
    featureName: 'new-checkout',
    targetEventName: 'checkout_completed',
    windowMinutes: 60,
    rows: [makeRow()],
  },
): CallContext {
  const getAttributionMock = vi.fn(async (_params: GetAttributionParams) => {
    if (clientResponse instanceof Error) {
      throw clientResponse;
    }
    return clientResponse;
  });

  const client = { getAttribution: getAttributionMock };

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
  to: '2026-04-08T00:00:00.000Z',
  featureName: 'new-checkout',
  eventName: 'checkout_completed',
};

describe('get_feature_attribution tool', () => {
  it('returns per-variant conversion rows and overall totals', async () => {
    const { context, client } = makeContext({
      featureName: 'new-checkout',
      targetEventName: 'checkout_completed',
      windowMinutes: 60,
      rows: [
        makeRow({
          variant: 'treatment',
          exposedUsers: 120,
          convertedUsers: 36,
          conversionRate: 0.3,
          avgTimeToConvertSec: 142,
        }),
        makeRow({
          variant: 'control',
          exposedUsers: 118,
          convertedUsers: 24,
          conversionRate: 0.2033898305,
          avgTimeToConvertSec: 156,
        }),
      ],
    });

    const result = await getFeatureAttribution(context, baseArgs);

    expect(result.isError).toBeFalsy();
    expect(client.getAttribution).toHaveBeenCalledWith({
      from: baseArgs.from,
      to: baseArgs.to,
      featureName: 'new-checkout',
      eventName: 'checkout_completed',
      variant: undefined,
      enabled: undefined,
      userId: undefined,
      sessionId: undefined,
      environment: undefined,
      appName: undefined,
      project: undefined,
      windowMinutes: undefined,
      attributionMode: undefined,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('new-checkout');
    expect(text).toContain('checkout_completed');
    expect(text).toContain('60-minute window');
    expect(text).toContain('treatment: 36/120 exposed users converted (30.00%)');
    expect(text).toContain('control: 24/118 exposed users converted (20.34%)');
    expect(text).toContain('Overall: 60/238 converted');

    const structured = result.structuredContent as {
      success: boolean;
      featureName: string;
      targetEventName: string;
      windowMinutes: number;
      rowCount: number;
      totals: { exposedUsers: number; convertedUsers: number; conversionRate: number };
      query: { attributionMode: string; windowMinutes: number };
    };
    expect(structured.success).toBe(true);
    expect(structured.featureName).toBe('new-checkout');
    expect(structured.targetEventName).toBe('checkout_completed');
    expect(structured.windowMinutes).toBe(60);
    expect(structured.rowCount).toBe(2);
    expect(structured.totals.exposedUsers).toBe(238);
    expect(structured.totals.convertedUsers).toBe(60);
    expect(structured.totals.conversionRate).toBeCloseTo(60 / 238);
    expect(structured.query.attributionMode).toBe('first');
    expect(structured.query.windowMinutes).toBe(60);
  });

  it('forwards all supported filters and options to the client', async () => {
    const { context, client } = makeContext({
      featureName: 'new-checkout',
      targetEventName: 'checkout_completed',
      windowMinutes: 10,
      rows: [],
    });

    await getFeatureAttribution(context, {
      ...baseArgs,
      variant: 'treatment',
      enabled: true,
      userId: 'demo-user-456',
      sessionId: '106534282',
      environment: 'production',
      appName: 'simple-usage-example',
      project: 'default',
      windowMinutes: 10,
      attributionMode: 'last',
    });

    expect(client.getAttribution).toHaveBeenCalledWith({
      from: baseArgs.from,
      to: baseArgs.to,
      featureName: 'new-checkout',
      eventName: 'checkout_completed',
      variant: 'treatment',
      enabled: true,
      userId: 'demo-user-456',
      sessionId: '106534282',
      environment: 'production',
      appName: 'simple-usage-example',
      project: 'default',
      windowMinutes: 10,
      attributionMode: 'last',
    });
  });

  it('renders "(no variant)" when a row has a null variant', async () => {
    const { context } = makeContext({
      featureName: 'dancing-skeleton',
      targetEventName: 'feature_used',
      windowMinutes: 10,
      rows: [makeRow({ variant: null, exposedUsers: 50, convertedUsers: 5, conversionRate: 0.1 })],
    });

    const result = await getFeatureAttribution(context, {
      ...baseArgs,
      featureName: 'dancing-skeleton',
      eventName: 'feature_used',
      windowMinutes: 10,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('(no variant): 5/50 exposed users converted (10.00%)');
  });

  it('renders n/a for avg time when no users converted', async () => {
    const { context } = makeContext({
      featureName: 'new-checkout',
      targetEventName: 'checkout_completed',
      windowMinutes: 60,
      rows: [
        makeRow({
          variant: 'treatment',
          exposedUsers: 40,
          convertedUsers: 0,
          conversionRate: 0,
          avgTimeToConvertSec: null,
        }),
      ],
    });

    const result = await getFeatureAttribution(context, baseArgs);

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('avg time-to-convert=n/a');
  });

  it('handles an empty result set gracefully', async () => {
    const { context } = makeContext({
      featureName: 'new-checkout',
      targetEventName: 'checkout_completed',
      windowMinutes: 60,
      rows: [],
    });

    const result = await getFeatureAttribution(context, baseArgs);

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Overall: 0/0 converted (0.00%)');
    expect(text).toContain('No exposures matched the query');
    expect(result.isError).toBeFalsy();
  });

  it('requires featureName and eventName', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureAttribution(context, {
      from: baseArgs.from,
      to: baseArgs.to,
    });

    expect(result.isError).toBe(true);
    expect(client.getAttribution).not.toHaveBeenCalled();
  });

  it('rejects a window longer than 31 days', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureAttribution(context, {
      ...baseArgs,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-15T00:00:00.000Z',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('31 days');
    expect(client.getAttribution).not.toHaveBeenCalled();
  });

  it('rejects when `to` is earlier than `from`', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureAttribution(context, {
      ...baseArgs,
      from: '2026-04-02T00:00:00.000Z',
      to: '2026-04-01T00:00:00.000Z',
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain(
      '`to` must be greater than or equal to `from`',
    );
    expect(client.getAttribution).not.toHaveBeenCalled();
  });

  it('rejects an invalid attributionMode', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureAttribution(context, { ...baseArgs, attributionMode: 'middle' });

    expect(result.isError).toBe(true);
    expect(client.getAttribution).not.toHaveBeenCalled();
  });

  it('rejects a zero windowMinutes', async () => {
    const { context, client } = makeContext();

    const result = await getFeatureAttribution(context, { ...baseArgs, windowMinutes: 0 });

    expect(result.isError).toBe(true);
    expect(client.getAttribution).not.toHaveBeenCalled();
  });

  it('propagates client errors via handleToolError', async () => {
    const failure = Object.assign(new Error('boom'), { code: 'HTTP_403' });
    const { context, logger } = makeContext(failure);

    const result = await getFeatureAttribution(context, baseArgs);

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
