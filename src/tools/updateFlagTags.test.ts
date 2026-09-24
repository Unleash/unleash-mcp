import { describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import type { FeatureTag, UnleashClient } from '../unleash/client.js';
import { updateFlagTags } from './updateFlagTags.js';

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

const resultingTags: FeatureTag[] = [{ type: 'simple', value: 'squad-checkout' }];

describe('update_flag_tags', () => {
  it('forwards the requested tag changes to the API', async () => {
    const updateFeatureTags = vi.fn(async () => resultingTags);
    const context = makeContext({ updateFeatureTags });

    const result = await updateFlagTags(context, {
      projectId: 'my-project',
      featureName: 'new-checkout-flow',
      addTags: [{ type: 'simple', value: 'squad-checkout' }],
      removeTags: [{ type: 'simple', value: 'squad-old' }],
    });

    expect(result.isError).toBeUndefined();
    expect(updateFeatureTags).toHaveBeenCalledWith('new-checkout-flow', {
      addedTags: [{ type: 'simple', value: 'squad-checkout' }],
      removedTags: [{ type: 'simple', value: 'squad-old' }],
    });
  });

  it('reports the resulting tags of the flag', async () => {
    const updateFeatureTags = vi.fn(async () => resultingTags);
    const context = makeContext({ updateFeatureTags });

    const result = await updateFlagTags(context, {
      projectId: 'my-project',
      featureName: 'new-checkout-flow',
      addTags: [{ type: 'simple', value: 'squad-checkout' }],
    });

    const text = (result.content as Array<{ type: string; text?: string }>)[0].text ?? '';
    expect(text).toContain('simple:squad-checkout');
    expect((result.structuredContent as { tags?: unknown }).tags).toEqual(resultingTags);
  });

  it('requires at least one tag to add or remove', async () => {
    const updateFeatureTags = vi.fn(async () => resultingTags);
    const context = makeContext({ updateFeatureTags });

    const result = await updateFlagTags(context, {
      projectId: 'my-project',
      featureName: 'new-checkout-flow',
    });

    expect(result.isError).toBe(true);
    expect(updateFeatureTags).not.toHaveBeenCalled();
  });
});
