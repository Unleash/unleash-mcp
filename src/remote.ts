import { createRemoteHandler } from './remoteHandler.ts';

export type { McpRequestSummary, ToolOutcome } from './mcpRequestSummary.ts';
export type { McpRequestHandler, RemoteHandlerOptions } from './remoteHandler.ts';

export const createMcpHandler = createRemoteHandler(globalThis.fetch);
