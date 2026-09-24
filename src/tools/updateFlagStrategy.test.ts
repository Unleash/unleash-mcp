import { describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import type { FeatureStrategy, UnleashClient } from '../unleash/client.js';
import { updateFlagStrategy } from './updateFlagStrategy.js';

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

const updatedStrategy: FeatureStrategy = {
  id: 'strategy-1',
  name: 'flexibleRollout',
  parameters: { rollout: '100', groupId: 'new-checkout-flow', stickiness: 'default' },
  constraints: [{ contextName: 'webVersion', operator: 'NUM_GTE', value: '1.42.0' }],
};

describe('update_flag_strategy', () => {
  it('sends only the requested changes to the strategy', async () => {
    const updateFeatureStrategy = vi.fn(async () => updatedStrategy);
    const context = makeContext({ updateFeatureStrategy });

    const result = await updateFlagStrategy(context, {
      projectId: 'my-project',
      featureName: 'new-checkout-flow',
      environment: 'production',
      strategyId: 'strategy-1',
      constraints: [{ contextName: 'webVersion', operator: 'NUM_GTE', value: '1.42.0' }],
    });

    expect(result.isError).toBeUndefined();
    expect(updateFeatureStrategy).toHaveBeenCalledWith(
      'my-project',
      'new-checkout-flow',
      'production',
      'strategy-1',
      { constraints: [{ contextName: 'webVersion', operator: 'NUM_GTE', value: '1.42.0' }] },
    );
    const text = (result.content as Array<{ type: string; text?: string }>)[0].text ?? '';
    expect(text).toContain('strategy-1');
    expect(text).toContain('production');
  });

  it('requires at least one field to update', async () => {
    const updateFeatureStrategy = vi.fn(async () => updatedStrategy);
    const context = makeContext({ updateFeatureStrategy });

    const result = await updateFlagStrategy(context, {
      projectId: 'my-project',
      featureName: 'new-checkout-flow',
      environment: 'production',
      strategyId: 'strategy-1',
    });

    expect(result.isError).toBe(true);
    expect(updateFeatureStrategy).not.toHaveBeenCalled();
  });

  it('clears the constraints when an empty list is provided', async () => {
    const updateFeatureStrategy = vi.fn(async () => ({ ...updatedStrategy, constraints: [] }));
    const context = makeContext({ updateFeatureStrategy });

    await updateFlagStrategy(context, {
      projectId: 'my-project',
      featureName: 'new-checkout-flow',
      environment: 'production',
      strategyId: 'strategy-1',
      constraints: [],
    });

    expect(updateFeatureStrategy).toHaveBeenCalledWith(
      'my-project',
      'new-checkout-flow',
      'production',
      'strategy-1',
      { constraints: [] },
    );
  });
});
