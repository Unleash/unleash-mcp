import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMcpHandler } from './remote.js';
import { type CreateServerOptions, createUnleashMcpServer } from './server.js';

// InMemoryTransport keeps initialize and tools/call on one McpServer instance, so the
// clientInfo sent during initialize is visible to the tool call.
async function callTool(
  name: string,
  args: Record<string, unknown>,
  options: Partial<CreateServerOptions> = {},
) {
  const server = createUnleashMcpServer({
    baseUrl: 'http://localhost:4242',
    authHeaders: { Authorization: 'test-token' },
    dryRun: true,
    logLevel: 'error',
    ...options,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name, arguments: args });
  await client.close();
  await server.close();
  return result;
}

const flag = { projectId: 'default', featureName: 'example' };

/**
 * E2E test for the remote MCP handler.
 *
 * Spins up an Express app with createMcpHandler, sends JSON-RPC requests
 * via supertest, and verifies the full MCP lifecycle works end-to-end.
 */
describe('remote MCP handler (e2e)', () => {
  const handler = createMcpHandler({
    baseUrl: 'http://localhost:4242',
    dryRun: true,
    logLevel: 'error',
  });

  const app = express();
  app.use(express.json());
  app.post('/', async (req, res) => {
    await handler(req, res, {
      authHeaders: { Authorization: 'test-token' },
      parsedBody: req.body,
    });
  });

  function mcpPost(body: object | object[]) {
    return request(app).post('/').set('Accept', 'application/json, text/event-stream').send(body);
  }

  it('handles initialize → tools/list → tools/call roundtrip', async () => {
    // 1. Initialize
    const initRes = await mcpPost({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    }).expect(200);

    expect(initRes.body.result).toBeDefined();
    expect(initRes.body.result.serverInfo.name).toBe('unleash-mcp');
    expect(initRes.body.result.capabilities.tools).toBeDefined();

    // 2. List tools (new stateless request — each request is independent)
    const listRes = await mcpPost([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ]).expect(200);

    const toolsResult = Array.isArray(listRes.body)
      ? listRes.body.find((r: { id?: number }) => r.id === 2)
      : listRes.body;

    const toolNames = toolsResult.result.tools.map((t: { name: string }) => t.name).sort();
    expect(toolNames).toEqual([
      'cleanup_flag',
      'create_flag',
      'create_targeting',
      'detect_flag',
      'evaluate_change',
      'evaluate_flag',
      'get_flag_history',
      'get_flag_state',
      'list_flags',
      'list_projects',
      'remove_flag_strategy',
      'search_flags',
      'set_flag_rollout',
      'toggle_flag_environment',
      'update_flag_lifecycle',
      'update_project_settings',
      'wrap_change',
    ]);

    // 3. Call a tool (dry-run create_flag)
    const callRes = await mcpPost([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'create_flag',
          arguments: {
            name: 'e2e-test-flag',
            type: 'release',
            description: 'Created by e2e test',
            projectId: 'default',
          },
        },
      },
    ]).expect(200);

    const callResult = Array.isArray(callRes.body)
      ? callRes.body.find((r: { id?: number }) => r.id === 3)
      : callRes.body;

    expect(callResult.result.content).toEqual([
      { type: 'text', text: JSON.stringify(callResult.result.structuredContent) },
    ]);
    expect(callResult.result.structuredContent).toMatchObject({
      dryRun: true,
      feature: { name: 'e2e-test-flag' },
    });
  });

  it('lists active feature flags via list_flags tool (dry-run)', async () => {
    await mcpPost({
      jsonrpc: '2.0',
      id: 10,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    }).expect(200);

    const callRes = await mcpPost([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'list_flags',
          arguments: { projectId: 'default' },
        },
      },
    ]).expect(200);

    const callResult = Array.isArray(callRes.body)
      ? callRes.body.find((r: { id?: number }) => r.id === 11)
      : callRes.body;

    expect(callResult.result).toBeDefined();
    expect(callResult.result.isError).toBeFalsy();
    expect(callResult.result.structuredContent).toMatchObject({
      success: true,
      projectId: 'default',
      archived: false,
      flags: expect.any(Array),
    });
    expect(callResult.result.structuredContent.flags.length).toBeGreaterThan(0);
    // Active path: every returned flag should have archived !== true
    for (const flag of callResult.result.structuredContent.flags) {
      expect(flag.archived).not.toBe(true);
    }
  });

  it('lists archived feature flags via list_flags tool (dry-run, archived=true)', async () => {
    await mcpPost({
      jsonrpc: '2.0',
      id: 30,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    }).expect(200);

    const callRes = await mcpPost([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: {
          name: 'list_flags',
          arguments: { projectId: 'default', archived: true },
        },
      },
    ]).expect(200);

    const callResult = Array.isArray(callRes.body)
      ? callRes.body.find((r: { id?: number }) => r.id === 31)
      : callRes.body;

    expect(callResult.result).toBeDefined();
    expect(callResult.result.isError).toBeFalsy();
    expect(callResult.result.structuredContent).toMatchObject({
      success: true,
      projectId: 'default',
      archived: true,
      flags: expect.any(Array),
    });
    expect(callResult.result.structuredContent.flags.length).toBeGreaterThan(0);
    // Archived path: every returned flag should be archived
    for (const flag of callResult.result.structuredContent.flags) {
      expect(flag.archived).toBe(true);
    }
  });

  it('lists projects via list_projects tool (dry-run)', async () => {
    await mcpPost({
      jsonrpc: '2.0',
      id: 20,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    }).expect(200);

    const callRes = await mcpPost([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: {
          name: 'list_projects',
          arguments: {},
        },
      },
    ]).expect(200);

    const callResult = Array.isArray(callRes.body)
      ? callRes.body.find((r: { id?: number }) => r.id === 21)
      : callRes.body;

    expect(callResult.result).toBeDefined();
    expect(callResult.result.isError).toBeFalsy();
    expect(callResult.result.structuredContent).toMatchObject({
      success: true,
      projects: expect.any(Array),
    });
    expect(callResult.result.structuredContent.projects.length).toBeGreaterThan(0);
  });
});

describe('tool results (e2e)', () => {
  it.each([
    ['get_flag_state', flag],
    ['remove_flag_strategy', { ...flag, environment: 'development', strategyId: 's1' }],
    [
      'set_flag_rollout',
      { ...flag, environments: [{ environment: 'development', rolloutPercentage: 50 }] },
    ],
    ['toggle_flag_environment', { ...flag, environment: 'development', enabled: true }],
    ['update_flag_lifecycle', { ...flag, action: 'complete', status: 'kept' }],
  ])('%s gives every client the same JSON data', async (name, args) => {
    const result = await callTool(name, args);

    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(result.structuredContent) },
    ]);
    expect(result.structuredContent).toMatchObject({ success: true });
  });

  it.each([
    ['cleanup_flag', { flagName: 'example' }],
    ['cleanup_flag', { flagName: 'example', preservePath: 'enabled' }],
    ['wrap_change', { flagName: 'example', language: 'typescript' }],
  ])('%s delivers its guidance only as text', async (name, args) => {
    const result = await callTool(name, args);

    expect(result).toEqual({ content: [{ type: 'text', text: expect.any(String) }] });
  });
});

describe('tool errors (e2e)', () => {
  it('reports an unreachable Unleash instance as a JSON error payload', async () => {
    const result = await callTool('get_flag_state', flag, {
      baseUrl: 'http://127.0.0.1:1',
      dryRun: false,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      success: false,
      error: { code: 'NETWORK_ERROR' },
    });
  });

  it('refuses a tool call whose arguments hold more than 10,000 elements', async () => {
    const files = Array(10_001).fill('file.ts');

    const result = await callTool('evaluate_change', { files });

    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: expect.stringContaining('maximum of 10000 elements') }],
    });
  });
});

describe('outbound User-Agent attribution (e2e)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ name: 'example', environments: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('forwards MCP clientInfo into outbound User-Agent header', async () => {
    await callTool('get_flag_state', flag, { dryRun: false });

    // Verify at least one outbound call has the enriched User-Agent
    expect(fetchSpy).toHaveBeenCalled();
    const enrichedCall = fetchSpy.mock.calls.find((c: unknown[]) => {
      const init = c[1] as RequestInit | undefined;
      if (!init) return false;
      const headers = init.headers as Record<string, string> | undefined;
      if (!headers) return false;
      return /^unleash-mcp\/[\w.-]+ \(MCP Server; client=test-client\/1\.0\.0\)$/.test(
        headers['User-Agent'] ?? '',
      );
    });
    expect(enrichedCall).toBeDefined();
  });

  it('omits client attribution when attributionEnabled is false', async () => {
    await callTool('get_flag_state', flag, { dryRun: false, attributionEnabled: false });

    expect(fetchSpy).toHaveBeenCalled();

    // Even though the client sent clientInfo, no outbound call should carry attribution.
    const attributedCall = fetchSpy.mock.calls.find((c: unknown[]) => {
      const init = c[1] as RequestInit | undefined;
      if (!init) return false;
      const headers = init.headers as Record<string, string> | undefined;
      if (!headers) return false;
      return (headers['User-Agent'] ?? '').includes('client=');
    });
    expect(attributedCall).toBeUndefined();

    const baseCall = fetchSpy.mock.calls.find((c: unknown[]) => {
      const init = c[1] as RequestInit | undefined;
      if (!init) return false;
      const headers = init.headers as Record<string, string> | undefined;
      if (!headers) return false;
      return /^unleash-mcp\/[\w.-]+ \(MCP Server\)$/.test(headers['User-Agent'] ?? '');
    });
    expect(baseCall).toBeDefined();
  });
});
