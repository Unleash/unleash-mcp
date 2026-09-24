import { describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import type { CreateFeatureFlagResponse, UnleashClient } from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { createFlag } from './createFlag.js';

function makeContext(client: Partial<UnleashClient>, dryRun = false): ServerContext {
  return {
    config: {
      unleash: {
        baseUrl: 'https://unleash.example.com',
        pat: 'test-pat',
        feedbackUrl: 'https://feedback.example.com',
      },
      server: { dryRun, logLevel: 'error', attributionEnabled: true },
    },
    unleashClient: client as UnleashClient,
    feedbackClient: {} as ServerContext['feedbackClient'],
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    cache: { projects: null, featureFlags: new Map() },
    getClientInfo: () => undefined,
    notifyProgress: vi.fn(async () => {}),
  };
}

function flagResponse(
  overrides: Partial<CreateFeatureFlagResponse> = {},
): CreateFeatureFlagResponse {
  return {
    name: 'new-checkout-flow',
    type: 'release',
    description: 'Controls the new checkout flow',
    project: 'my-project',
    createdAt: '2026-01-01T00:00:00.000Z',
    archived: false,
    impressionData: false,
    ...overrides,
  };
}

describe('create_flag tags', () => {
  it('forwards tags to the Unleash API when creating a flag', async () => {
    const createFeatureFlag = vi.fn(async () =>
      flagResponse({ tags: [{ type: 'owner', value: 'squad-checkout' }] }),
    );
    const context = makeContext({ createFeatureFlag });

    const result = await createFlag(context, {
      projectId: 'my-project',
      name: 'new-checkout-flow',
      type: 'release',
      description: 'Controls the new checkout flow',
      tags: [{ type: 'owner', value: 'squad-checkout' }],
    });

    expect(result.isError).toBeUndefined();
    expect(createFeatureFlag).toHaveBeenCalledWith(
      'my-project',
      expect.objectContaining({ tags: [{ type: 'owner', value: 'squad-checkout' }] }),
    );
  });

  it('backfills only the tags the create response did not echo', async () => {
    // Unleash versions that predate inline tags on create ignore the field
    // silently, so the tool has to reconcile what actually landed.
    const createFeatureFlag = vi.fn(async () =>
      flagResponse({ tags: [{ type: 'owner', value: 'squad-checkout' }] }),
    );
    const addFeatureTag = vi.fn(
      async (_featureName: string, tag: { type: string; value: string }) => tag,
    );
    const context = makeContext({ createFeatureFlag, addFeatureTag });

    await createFlag(context, {
      projectId: 'my-project',
      name: 'new-checkout-flow',
      type: 'release',
      description: 'Controls the new checkout flow',
      tags: [
        { type: 'owner', value: 'squad-checkout' },
        { type: 'lifecycle', value: 'temporary' },
      ],
    });

    expect(addFeatureTag).toHaveBeenCalledTimes(1);
    expect(addFeatureTag).toHaveBeenCalledWith('new-checkout-flow', {
      type: 'lifecycle',
      value: 'temporary',
    });
  });

  it('reports a tag that could not be applied instead of failing the creation', async () => {
    const createFeatureFlag = vi.fn(async () => flagResponse());
    const addFeatureTag = vi.fn(async () => {
      throw new CustomError('HTTP_404', 'Tag type does not exist');
    });
    const context = makeContext({ createFeatureFlag, addFeatureTag });

    const result = await createFlag(context, {
      projectId: 'my-project',
      name: 'new-checkout-flow',
      type: 'release',
      description: 'Controls the new checkout flow',
      tags: [{ type: 'owner', value: 'squad-checkout' }],
    });

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ type: string; text?: string }>)[0].text ?? '';
    expect(text).toContain('owner:squad-checkout');
    expect(text).toContain('Tag type does not exist');
  });

  it('exposes the applied tags in the structured content', async () => {
    const createFeatureFlag = vi.fn(async () =>
      flagResponse({ tags: [{ type: 'owner', value: 'squad-checkout' }] }),
    );
    const context = makeContext({ createFeatureFlag });

    const result = await createFlag(context, {
      projectId: 'my-project',
      name: 'new-checkout-flow',
      type: 'release',
      description: 'Controls the new checkout flow',
      tags: [{ type: 'owner', value: 'squad-checkout' }],
    });

    const structured = result.structuredContent as { feature: { tags?: unknown } };
    expect(structured.feature.tags).toEqual([{ type: 'owner', value: 'squad-checkout' }]);
  });
});
