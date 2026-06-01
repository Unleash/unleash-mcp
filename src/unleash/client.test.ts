import { describe, expect, it } from 'vitest';
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
