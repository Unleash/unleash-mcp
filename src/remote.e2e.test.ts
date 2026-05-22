import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createMcpHandler } from './remote.js';

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
      'detect_flag',
      'evaluate_change',
      'get_flag_state',
      'list_flags',
      'list_projects',
      'remove_flag_strategy',
      'set_flag_rollout',
      'toggle_flag_environment',
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

    expect(callResult.result).toBeDefined();
    expect(callResult.result.isError).toBeFalsy();

    expect(callResult.result).toMatchObject({
      content: expect.arrayContaining([
        { type: 'text', text: expect.stringContaining('e2e-test-flag') },
        { type: 'text', text: expect.stringContaining('DRY RUN') },
      ]),
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
