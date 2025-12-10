import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServerContext } from '../context.js';

export interface ToolType {
  name: string;
  description: string;
  inputSchema: AnySchema;
  implementation: (
    context: ServerContext,
    args: unknown,
    progressToken?: string | number,
  ) => Promise<CallToolResult>;
}
