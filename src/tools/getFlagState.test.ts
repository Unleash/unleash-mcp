import { describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import type { FeatureDetails, UnleashClient } from '../unleash/client.js';
import { getFlagState } from './getFlagState.js';

function makeContext(client: Partial<UnleashClient>): ServerContext {
  return {
    config: {
      unleash: {
        baseUrl: 'https://unleash.example.com',
        pat: 'test-pat',
        feedbackUrl: 'https://feedback.example.com',
      },
      server: { dryRun: false, logLevel: 'error', attributionEnabled: true },
    },
    unleashClient: client as UnleashClient,
    feedbackClient: {} as ServerContext['feedbackClient'],
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    cache: { projects: null, featureFlags: new Map() },
    getClientInfo: () => undefined,
    notifyProgress: vi.fn(async () => {}),
  };
}

function feature(overrides: Partial<FeatureDetails> = {}): FeatureDetails {
  return {
    name: 'new-checkout-flow',
    type: 'release',
    project: 'my-project',
    enabled: false,
    archived: false,
    impressionData: false,
    environments: [],
    ...overrides,
  };
}

async function runGetFlagState(details: FeatureDetails) {
  const context = makeContext({ getFeature: vi.fn(async () => details) });
  const result = await getFlagState(context, {
    projectId: 'my-project',
    featureName: 'new-checkout-flow',
  });
  return {
    text: (result.content as Array<{ type: string; text?: string }>)[0].text ?? '',
    structured: result.structuredContent as { tags?: unknown },
  };
}

describe('get_flag_state tags', () => {
  it('lists the flag tags in the summary and structured content', async () => {
    const { text, structured } = await runGetFlagState(
      feature({
        tags: [
          { type: 'owner', value: 'squad-checkout' },
          { type: 'lifecycle', value: 'temporary' },
        ],
      }),
    );

    expect(text).toContain('Tags: owner:squad-checkout, lifecycle:temporary');
    expect(structured.tags).toEqual([
      { type: 'owner', value: 'squad-checkout' },
      { type: 'lifecycle', value: 'temporary' },
    ]);
  });

  it('reports when the flag has no tags', async () => {
    const { text, structured } = await runGetFlagState(feature({ tags: [] }));

    expect(text).toContain('Tags: none');
    expect(structured.tags).toEqual([]);
  });
});
