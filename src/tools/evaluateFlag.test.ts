import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import { silentLogger as logger } from '../test-utils/silentLogger.js';
import type {
  PlaygroundFeatureRequest,
  PlaygroundFeatureResponse,
  UnleashClient,
} from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { buildUnleashContext, evaluateFlag } from './evaluateFlag.js';

const evaluateFeature =
  vi.fn<
    (featureName: string, request: PlaygroundFeatureRequest) => Promise<PlaygroundFeatureResponse>
  >();

function createContext(overrides: { defaultEnvironment?: string } = {}): ServerContext {
  return {
    config: {
      unleash: {
        baseUrl: 'https://unleash.example.com',
        pat: '',
        defaultEnvironment: overrides.defaultEnvironment,
        feedbackUrl: 'https://feedback.example.com',
      },
      server: { dryRun: false, logLevel: 'info', attributionEnabled: true },
    },
    unleashClient: { evaluateFeature } as unknown as UnleashClient,
    feedbackClient: {} as ServerContext['feedbackClient'],
    feedbackConsentResolver: {} as ServerContext['feedbackConsentResolver'],
    logger,
    cache: { projects: null, featureFlags: new Map() },
    getClientInfo: () => undefined,
    notifyProgress: async () => {},
  };
}

function response(
  feature: Partial<PlaygroundFeatureResponse['feature']> = {},
  request: PlaygroundFeatureRequest = { environment: 'production', context: { appName: 'test' } },
): PlaygroundFeatureResponse {
  return {
    input: request,
    feature: {
      name: 'show-new-checkout',
      projectId: 'ecommerce',
      isEnabled: true,
      isEnabledInCurrentEnvironment: true,
      variant: { name: 'disabled', enabled: false },
      variants: [],
      strategies: { result: true, data: [] },
      ...feature,
    },
  };
}

function textOf(result: Awaited<ReturnType<typeof evaluateFlag>>): string {
  const first = result.content[0];
  return first.type === 'text' ? first.text : '';
}

describe('buildUnleashContext', () => {
  it('keeps standard fields top-level and moves custom keys into properties', () => {
    expect(buildUnleashContext({ userId: 'asdf', tier: 'top' })).toEqual({
      appName: 'unleash-mcp',
      userId: 'asdf',
      properties: { tier: 'top' },
    });
  });

  it('stringifies numbers and booleans and merges nested properties', () => {
    expect(
      buildUnleashContext({ seats: 3, beta: true, properties: { region: 'eu', level: 2 } }),
    ).toEqual({
      appName: 'unleash-mcp',
      properties: { seats: '3', beta: 'true', region: 'eu', level: '2' },
    });
  });

  it('uses appName from the context unless one is passed explicitly', () => {
    expect(buildUnleashContext({ appName: 'web' }).appName).toBe('web');
    expect(buildUnleashContext({ appName: 'web' }, 'mobile').appName).toBe('mobile');
  });

  it('rejects nested objects outside of properties', () => {
    expect(() => buildUnleashContext({ user: { id: '1' } })).toThrow(CustomError);
  });
});

describe('evaluate_flag', () => {
  afterEach(() => {
    evaluateFeature.mockReset();
  });

  it('sends the mapped context and reports an enabled flag', async () => {
    evaluateFeature.mockResolvedValue(response());

    const result = await evaluateFlag(createContext(), {
      featureName: 'show-new-checkout',
      environment: 'production',
      context: { userId: 'asdf', tier: 'top' },
    });

    expect(evaluateFeature).toHaveBeenCalledWith('show-new-checkout', {
      environment: 'production',
      context: { appName: 'unleash-mcp', userId: 'asdf', properties: { tier: 'top' } },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('evaluates to: ENABLED');
    expect(result.structuredContent).toMatchObject({
      success: true,
      projectId: 'ecommerce',
      environment: 'production',
      enabled: true,
      links: { ui: 'https://unleash.example.com/projects/ecommerce/features/show-new-checkout' },
    });
  });

  it('falls back to the default environment', async () => {
    evaluateFeature.mockResolvedValue(response());

    await evaluateFlag(createContext({ defaultEnvironment: 'development' }), {
      featureName: 'show-new-checkout',
    });

    expect(evaluateFeature.mock.calls[0][1].environment).toBe('development');
  });

  it('returns an error when no environment can be resolved', async () => {
    const result = await evaluateFlag(createContext(), { featureName: 'show-new-checkout' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code: 'MISSING_ENVIRONMENT' } });
    expect(evaluateFeature).not.toHaveBeenCalled();
  });

  it('reports the variant and failing constraints', async () => {
    evaluateFeature.mockResolvedValue(
      response({
        isEnabled: false,
        variant: { name: 'blue', enabled: true, payload: { type: 'string', value: 'b' } },
        strategies: {
          result: false,
          data: [
            {
              id: 's1',
              name: 'flexibleRollout',
              title: 'Top tier',
              result: { evaluationStatus: 'complete', enabled: false },
              disabled: false,
              segments: [{ id: 1, name: 'internal', result: false, constraints: [] }],
              constraints: [
                { contextName: 'tier', operator: 'IN', values: ['top'], result: false },
                { contextName: 'userId', operator: 'IN', values: ['x'], result: true },
              ],
              parameters: {},
              links: { edit: '/edit' },
            },
          ],
        },
      }),
    );

    const text = textOf(
      await evaluateFlag(createContext(), { featureName: 'f', environment: 'production' }),
    );

    expect(text).toContain('evaluates to: DISABLED');
    expect(text).toContain('Variant: blue with string payload b');
    expect(text).toContain('- Top tier (flexibleRollout): did not match');
    expect(text).toContain('failing constraint: tier IN [top]');
    expect(text).not.toContain('userId IN');
    expect(text).toContain('failing segment: internal');
  });

  it('explains unknown results and environment warnings', async () => {
    evaluateFeature.mockResolvedValue(
      response({
        isEnabled: false,
        isEnabledInCurrentEnvironment: false,
        hasUnsatisfiedDependency: true,
        strategies: { result: 'unknown', data: [] },
      }),
    );

    const text = textOf(
      await evaluateFlag(createContext(), { featureName: 'f', environment: 'production' }),
    );

    expect(text).toContain('evaluates to: UNKNOWN');
    expect(text).toContain('turned off in "production"');
    expect(text).toContain('parent dependency');
  });

  it('adds a hint when the flag is not found', async () => {
    evaluateFeature.mockRejectedValue(new CustomError('HTTP_404', 'Could not find feature'));

    const result = await evaluateFlag(createContext(), {
      featureName: 'missing',
      environment: 'production',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('list_flags');
  });
});
