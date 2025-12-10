import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServerContext } from '../context.js';

export interface ToolType {
  name: string;
  description: string;
  // Schemas come from individual tools (zod). Using unknown here keeps registration lightweight
  // and avoids deep instantiation issues with the compat types.
  inputSchema: unknown;
  implementation: (
    context: ServerContext,
    args: unknown,
    progressToken?: string | number,
  ) => Promise<CallToolResult>;
}
