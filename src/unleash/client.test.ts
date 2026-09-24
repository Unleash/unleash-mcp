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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UnleashClient feature tags', () => {
  it('posts a tag to the feature tags endpoint', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(json({ type: 'owner', value: 'squad-checkout' }, 201));
    const client = new UnleashClient('https://unleash.example.com', { Authorization: 'test-pat' });

    const tag = await client.addFeatureTag('new checkout/flow', {
      type: 'owner',
      value: 'squad-checkout',
    });

    expect(tag).toEqual({ type: 'owner', value: 'squad-checkout' });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://unleash.example.com/api/admin/features/new%20checkout%2Fflow/tags');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ type: 'owner', value: 'squad-checkout' });
  });

  it('maps tags from the project features listing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      json({
        features: [
          {
            name: 'new-checkout-flow',
            project: 'my-project',
            type: 'release',
            tags: [{ type: 'owner', value: 'squad-checkout' }],
          },
        ],
      }),
    );
    const client = new UnleashClient('https://unleash.example.com', { Authorization: 'test-pat' });

    const flags = await client.listFeatureFlags('my-project');

    expect(flags[0].tags).toEqual([{ type: 'owner', value: 'squad-checkout' }]);
  });

  it('echoes the requested tags without calling the API in dry-run mode', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const client = new UnleashClient('https://unleash.example.com', {}, true);

    const response = await client.createFeatureFlag('my-project', {
      name: 'new-checkout-flow',
      type: 'release',
      description: 'Controls the new checkout flow',
      tags: [{ type: 'owner', value: 'squad-checkout' }],
    });

    expect(response.tags).toEqual([{ type: 'owner', value: 'squad-checkout' }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('UnleashClient updateFeatureTags', () => {
  it('puts added and removed tags to the feature tags endpoint', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(json({ version: 1, tags: [{ type: 'simple', value: 'squad-checkout' }] }));
    const client = new UnleashClient('https://unleash.example.com', { Authorization: 'test-pat' });

    const tags = await client.updateFeatureTags('new-checkout-flow', {
      addedTags: [{ type: 'simple', value: 'squad-checkout' }],
      removedTags: [{ type: 'simple', value: 'squad-old' }],
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://unleash.example.com/api/admin/features/new-checkout-flow/tags');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      addedTags: [{ type: 'simple', value: 'squad-checkout' }],
      removedTags: [{ type: 'simple', value: 'squad-old' }],
    });
    expect(tags).toEqual([{ type: 'simple', value: 'squad-checkout' }]);
  });

  it('sends an empty list for the side that was not requested', async () => {
    // The Unleash API requires both addedTags and removedTags to be present.
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(json({ version: 1, tags: [] }));
    const client = new UnleashClient('https://unleash.example.com', { Authorization: 'test-pat' });

    await client.updateFeatureTags('new-checkout-flow', {
      addedTags: [{ type: 'simple', value: 'squad-checkout' }],
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      addedTags: [{ type: 'simple', value: 'squad-checkout' }],
      removedTags: [],
    });
  });

  it('echoes the added tags without calling the API in dry-run mode', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const client = new UnleashClient('https://unleash.example.com', {}, true);

    const tags = await client.updateFeatureTags('new-checkout-flow', {
      addedTags: [{ type: 'simple', value: 'squad-checkout' }],
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(tags).toEqual([{ type: 'simple', value: 'squad-checkout' }]);
  });
});
