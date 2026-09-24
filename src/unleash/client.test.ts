import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnleashClient } from './client.js';

describe('UnleashClient User-Agent', () => {
  function getUserAgent(client: UnleashClient): string {
    const headers = (
      client as unknown as { buildRequestHeaders: () => Record<string, string> }
    ).buildRequestHeaders();
    return headers['User-Agent'];
  }

  it('emits base User-Agent when no getClientInfo is provided', () => {
    const client = new UnleashClient('https://example.com', {}, true);
    expect(getUserAgent(client)).toMatch(/^unleash-mcp\/[\w.-]+ \(MCP Server\)$/);
  });

  it('emits base User-Agent when getClientInfo returns undefined', () => {
    const client = new UnleashClient('https://example.com', {}, true, () => undefined);
    expect(getUserAgent(client)).toMatch(/^unleash-mcp\/[\w.-]+ \(MCP Server\)$/);
  });

  it('emits enriched User-Agent when getClientInfo returns valid info', () => {
    const client = new UnleashClient('https://example.com', {}, true, () => ({
      name: 'claude-code',
      version: '1.2.3',
    }));
    expect(getUserAgent(client)).toMatch(
      /^unleash-mcp\/[\w.-]+ \(MCP Server; client=claude-code\/1\.2\.3\)$/,
    );
  });

  it('emits base User-Agent when attribution is disabled', () => {
    const client = new UnleashClient(
      'https://example.com',
      {},
      true,
      () => ({
        name: 'claude-code',
        version: '1.2.3',
      }),
      false,
    );
    expect(getUserAgent(client)).toMatch(/^unleash-mcp\/[\w.-]+ \(MCP Server\)$/);
  });

  it('falls back to base User-Agent when getClientInfo throws', () => {
    const client = new UnleashClient('https://example.com', {}, true, () => {
      throw new Error('boom');
    });
    expect(getUserAgent(client)).toMatch(/^unleash-mcp\/[\w.-]+ \(MCP Server\)$/);
  });

  it('sanitizes special chars in clientInfo before composing', () => {
    const client = new UnleashClient('https://example.com', {}, true, () => ({
      name: 'evil(client)',
      version: '1;0',
    }));
    expect(getUserAgent(client)).toMatch(
      /^unleash-mcp\/[\w.-]+ \(MCP Server; client=evilclient\/10\)$/,
    );
  });
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function bodyOf(
  fetchSpy: { mock: { calls: unknown[][] } },
  index: number,
): Record<string, unknown> {
  const [, init] = fetchSpy.mock.calls[index] as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

const featureWithStrategy = {
  name: 'new-checkout-flow',
  project: 'my-project',
  environments: [
    {
      name: 'production',
      environment: 'production',
      enabled: true,
      strategies: [
        {
          id: 'strategy-1',
          name: 'flexibleRollout',
          title: 'Gradual rollout',
          disabled: false,
          parameters: { rollout: '50', groupId: 'new-checkout-flow', stickiness: 'default' },
          constraints: [{ contextName: 'appName', operator: 'IN', values: ['web'] }],
          segments: [3],
        },
      ],
    },
  ],
};

function stubFeatureAndUpdate() {
  return vi
    .spyOn(global, 'fetch')
    .mockImplementation(async (_url, init) =>
      init?.method === 'GET'
        ? json(featureWithStrategy)
        : json({ id: 'strategy-1', name: 'flexibleRollout', parameters: {} }),
    );
}

describe('UnleashClient updateFeatureStrategy', () => {
  it('puts the merged strategy to the strategy endpoint', async () => {
    const fetchSpy = stubFeatureAndUpdate();
    const client = new UnleashClient('https://unleash.example.com', { Authorization: 'test-pat' });

    await client.updateFeatureStrategy(
      'my-project',
      'new-checkout-flow',
      'production',
      'strategy-1',
      {
        constraints: [{ contextName: 'webVersion', operator: 'NUM_GTE', value: '1.42.0' }],
      },
    );

    const [url, init] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      'https://unleash.example.com/api/admin/projects/my-project/features/new-checkout-flow/environments/production/strategies/strategy-1',
    );
    expect(init.method).toBe('PUT');
  });

  it('keeps the fields that were not provided', async () => {
    const fetchSpy = stubFeatureAndUpdate();
    const client = new UnleashClient('https://unleash.example.com', { Authorization: 'test-pat' });

    await client.updateFeatureStrategy(
      'my-project',
      'new-checkout-flow',
      'production',
      'strategy-1',
      {
        constraints: [{ contextName: 'webVersion', operator: 'NUM_GTE', value: '1.42.0' }],
      },
    );

    expect(bodyOf(fetchSpy, 1)).toMatchObject({
      name: 'flexibleRollout',
      title: 'Gradual rollout',
      disabled: false,
      parameters: { rollout: '50', groupId: 'new-checkout-flow', stickiness: 'default' },
      constraints: [{ contextName: 'webVersion', operator: 'NUM_GTE', value: '1.42.0' }],
      segments: [3],
    });
  });

  it('writes a new rollout percentage into the strategy parameters', async () => {
    const fetchSpy = stubFeatureAndUpdate();
    const client = new UnleashClient('https://unleash.example.com', { Authorization: 'test-pat' });

    await client.updateFeatureStrategy(
      'my-project',
      'new-checkout-flow',
      'production',
      'strategy-1',
      {
        rolloutPercentage: 100,
      },
    );

    expect(bodyOf(fetchSpy, 1)).toMatchObject({
      parameters: { rollout: '100', groupId: 'new-checkout-flow', stickiness: 'default' },
      constraints: [{ contextName: 'appName', operator: 'IN', values: ['web'] }],
    });
  });

  it('fails with a helpful error when the strategy is not in the environment', async () => {
    stubFeatureAndUpdate();
    const client = new UnleashClient('https://unleash.example.com', { Authorization: 'test-pat' });

    await expect(
      client.updateFeatureStrategy('my-project', 'new-checkout-flow', 'production', 'missing-id', {
        rolloutPercentage: 100,
      }),
    ).rejects.toThrow(/missing-id/);
  });

  it('returns the merged strategy without calling the API in dry-run mode', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const client = new UnleashClient('https://unleash.example.com', {}, true);

    const strategy = await client.updateFeatureStrategy(
      'my-project',
      'new-checkout-flow',
      'production',
      'strategy-1',
      { constraints: [{ contextName: 'webVersion', operator: 'NUM_GTE', value: '1.42.0' }] },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(strategy.id).toBe('strategy-1');
    expect(strategy.constraints).toEqual([
      { contextName: 'webVersion', operator: 'NUM_GTE', value: '1.42.0' },
    ]);
  });
});

describe('UnleashClient strategy constraints', () => {
  it('sends constraints in the flexibleRollout strategy payload', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(json({ id: 'strategy-1', name: 'flexibleRollout', parameters: {} }, 201));
    const client = new UnleashClient('https://unleash.example.com', { Authorization: 'test-pat' });

    await client.setFlexibleRolloutStrategy('my-project', 'new-checkout-flow', 'production', {
      rolloutPercentage: 100,
      constraints: [{ contextName: 'webVersion', operator: 'NUM_GTE', value: '1.42.0' }],
    });

    expect(bodyOf(fetchSpy, 0).constraints).toEqual([
      { contextName: 'webVersion', operator: 'NUM_GTE', value: '1.42.0' },
    ]);
  });
});
