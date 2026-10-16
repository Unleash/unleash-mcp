import { describe, expect, it } from 'vitest';
import type { ServerContext } from '../context.js';
import { silentLogger as logger } from '../test-utils/silentLogger.js';
import type { FeatureEnvironment, Segment, UnleashClient } from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { getFlagState } from './getFlagState.js';

const featureName = 'new-checkout';

function createContext(
  environments: FeatureEnvironment[],
  segments: Segment[] = [],
): ServerContext {
  return {
    config: {
      unleash: {
        baseUrl: 'https://unleash.example.com',
        pat: '',
        defaultProject: 'default',
        feedbackUrl: 'https://feedback.example.com',
      },
      server: { dryRun: false, logLevel: 'info', attributionEnabled: true },
    },
    unleashClient: {
      getFeature: async () => ({ name: featureName, environments }),
      getSegment: async (id: number) => {
        const segment = segments.find((s) => s.id === id);
        if (!segment) throw new CustomError('HTTP_404', `Segment ${id} not found`);
        return segment;
      },
    } as unknown as UnleashClient,
    feedbackClient: {} as ServerContext['feedbackClient'],
    feedbackConsentResolver: {} as ServerContext['feedbackConsentResolver'],
    logger,
    cache: { projects: null, featureFlags: new Map() },
    getClientInfo: () => undefined,
    askUserToChoose: async () => undefined,
    notifyProgress: async () => {},
  };
}

function environmentUsing(name: string, ...segmentsPerStrategy: number[][]): FeatureEnvironment {
  return {
    name,
    enabled: true,
    strategies: segmentsPerStrategy.map((segments, index) => ({
      id: `${name}-${index}`,
      name: 'flexibleRollout',
      parameters: {},
      segments,
    })),
  };
}

function segment(id: number): Segment {
  return { id, name: `segment-${id}`, constraints: [] };
}

describe('get_flag_state segments', () => {
  it('hints at the segments the strategies use instead of listing them', async () => {
    const context = createContext([environmentUsing('production', [3], [7, 3])]);

    const result = await getFlagState(context, { featureName });

    expect(result.structuredContent).toMatchObject({
      hint: 'Strategies use segments 3, 7. Call again with includeSegments: true to see who they target.',
    });
    expect(result.structuredContent).not.toHaveProperty('segments');
  });

  it('adds no hint when the strategies use no segments', async () => {
    const context = createContext([environmentUsing('production', [])]);

    const result = await getFlagState(context, { featureName });

    expect(result.structuredContent).not.toHaveProperty('hint');
  });

  it('lists each segment the strategies use once when asked', async () => {
    const context = createContext(
      [environmentUsing('development', [3]), environmentUsing('production', [3, 7])],
      [segment(3), segment(7)],
    );

    const result = await getFlagState(context, { featureName, includeSegments: true });

    expect(result.structuredContent).toMatchObject({ segments: [segment(3), segment(7)] });
    expect(result.structuredContent).not.toHaveProperty('hint');
  });

  it('limits segments to the requested environment', async () => {
    const context = createContext(
      [environmentUsing('development', [3]), environmentUsing('production', [7])],
      [segment(3), segment(7)],
    );

    const result = await getFlagState(context, {
      featureName,
      environment: 'production',
      includeSegments: true,
    });

    expect(result.structuredContent).toMatchObject({ segments: [segment(7)] });
  });

  it('reports segments it could not fetch without failing the call', async () => {
    const context = createContext([environmentUsing('production', [3, 9])], [segment(3)]);

    const result = await getFlagState(context, { featureName, includeSegments: true });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      segments: [segment(3)],
      segmentErrors: [{ id: 9, error: { code: 'HTTP_404' } }],
    });
  });
});
