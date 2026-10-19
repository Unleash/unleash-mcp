import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with { type: 'json' };

export const createServer = (): McpServer => {
  const server = new McpServer({ name: 'unleash-mcp', version: pkg.version });

  server.registerTool('ping', { description: 'Dummy tool: replies with pong.' }, async () => ({
    content: [{ type: 'text', text: 'pong' }],
  }));

  return server;
};
