import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with { type: 'json' };
import type { UnleashClient } from './unleash/client.ts';

export const createServer = (_unleash: UnleashClient): McpServer => {
  const server = new McpServer({ name: 'unleash-mcp', version: pkg.version });

  server.registerTool('ping', { description: 'Dummy tool: replies with pong.' }, async () => ({
    content: [{ type: 'text', text: 'pong' }],
  }));

  return server;
};
