import pkg from '../package.json' with { type: 'json' };
import { createRemoteHandler } from './remoteHandler.ts';

export type { McpRequestSummary } from './mcpRequestSummary.ts';
export type { McpRequestHandler, RemoteHandlerOptions } from './remoteHandler.ts';

export const createMcpHandler = createRemoteHandler(globalThis.fetch);

export const mcpVersion = pkg.version;
