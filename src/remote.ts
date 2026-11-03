import { createRemoteHandler } from './remoteHandler.ts';

export type { McpRequestHandler, RemoteHandlerOptions } from './remoteHandler.ts';
export type { ToolOutcome } from './toolOutcome.ts';

export const createMcpHandler = createRemoteHandler(globalThis.fetch);
