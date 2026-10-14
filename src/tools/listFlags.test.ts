import { describe, expect, it } from 'vitest';
import type { ServerContext } from '../context.js';
import { silentLogger } from '../test-utils/silentLogger.js';
import { payloadOf } from '../test-utils/toolPayload.js';
import type { FeatureFlagSummary, UnleashClient } from '../unleash/client.js';
import { listFlags } from './listFlags.js';

function createContext(flagCount: number): ServerContext {
  const flags: FeatureFlagSummary[] = Array.from({ length: flagCount }, (_, i) => ({
    name: `flag-${i}`,
    project: 'default',
    url: `https://unleash.example.com/projects/default/features/flag-${i}`,
  }));
  return {
    config: {
      unleash: { baseUrl: 'https://unleash.example.com', pat: '', feedbackUrl: '' },
      server: { dryRun: false, logLevel: 'info', attributionEnabled: true },
    },
    unleashClient: { listFeatureFlags: async () => flags } as unknown as UnleashClient,
    feedbackClient: {} as ServerContext['feedbackClient'],
    feedbackConsentResolver: {} as ServerContext['feedbackConsentResolver'],
    logger: silentLogger,
    cache: { projects: null, featureFlags: new Map() },
    getClientInfo: () => undefined,
    notifyProgress: async () => {},
  };
}

describe('list_flags', () => {
  it('points to the next page while more flags remain', async () => {
    const context = createContext(3);

    const result = await listFlags(context, { projectId: 'default', limit: 2 });

    expect(payloadOf(result)).toMatchObject({ offset: 0, limit: 2, nextOffset: 2, totalFlags: 3 });
  });

  it('reports no next page on the last page', async () => {
    const context = createContext(3);

    const result = await listFlags(context, { projectId: 'default', limit: 2, offset: 2 });

    expect(payloadOf(result)).not.toHaveProperty('nextOffset');
  });
});
