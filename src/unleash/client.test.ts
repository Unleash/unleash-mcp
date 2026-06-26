import { describe, expect, it, vi } from 'vitest';
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

describe('UnleashClient fetch injection', () => {
  it('routes requests through the injected fetchFn instead of the global fetch', async () => {
    const fakeFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            name: 'new-flag',
            type: 'release',
            description: 'A test flag',
            project: 'default',
            createdAt: '2026-01-01T00:00:00.000Z',
            archived: false,
            impressionData: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );

    const client = new UnleashClient(
      'https://example.com',
      { Authorization: 'token' },
      false,
      undefined,
      true,
      fakeFetch,
    );

    const result = await client.createFeatureFlag('default', {
      name: 'new-flag',
      type: 'release',
      description: 'A test flag',
    });

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0];
    expect(url).toBe('https://example.com/api/admin/projects/default/features');
    expect(init?.method).toBe('POST');
    expect(result.name).toBe('new-flag');
  });
});
