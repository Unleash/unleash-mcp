import { createServer } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpHandler } from './remote.js';

/**
 * E2E test for the remote MCP handler.
 *
 * Spins up a real HTTP server with createMcpHandler, sends JSON-RPC requests
 * via supertest, and verifies the full MCP lifecycle works end-to-end.
 */
describe('remote MCP handler (e2e)', () => {
  const handler = createMcpHandler({
    baseUrl: 'http://localhost:4242',
    dryRun: true,
    logLevel: 'error',
  });

  const server = createServer(async (req, res) => {
    await handler(req, res, {
      authHeaders: { Authorization: 'test-token' },
      parsedBody: await parseBody(req),
    });
  });

  beforeAll(() => new Promise<void>((resolve) => server.listen(0, resolve)));
  afterAll(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  );

  function mcpPost(body: unknown) {
    return request(server)
      .post('/')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send(body);
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

    expect(toolsResult.result.tools).toBeDefined();
    const toolNames = toolsResult.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('create_flag');
    expect(toolNames).toContain('evaluate_change');
    expect(toolNames).toContain('detect_flag');
    expect(toolNames).toContain('wrap_change');
    expect(toolNames).toContain('cleanup_flag');
    expect(toolNames).toContain('set_flag_rollout');
    expect(toolNames).toContain('get_flag_state');
    expect(toolNames).toContain('toggle_flag_environment');
    expect(toolNames).toContain('remove_flag_strategy');
    expect(toolNames).toHaveLength(9);

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

    const textContent = callResult.result.content.find((c: { type: string }) => c.type === 'text');
    expect(textContent.text).toContain('e2e-test-flag');
    expect(textContent.text).toContain('DRY RUN');
  });
});

function parseBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
