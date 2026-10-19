import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with { type: 'json' };

export const createServer = (): McpServer => new McpServer({ name: 'unleash-mcp', version: pkg.version });
