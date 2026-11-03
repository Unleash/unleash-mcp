import { createRemoteHandler } from './remoteHandler.ts';

export type { McpRequestHandler, RemoteHandlerOptions } from './remoteHandler.ts';
export type { McpRequestReport, ToolOutcome } from './requestReport.ts';

export const createMcpHandler = createRemoteHandler(globalThis.fetch);
