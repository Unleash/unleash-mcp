import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { ServerContext } from '../context.js';

type V4Schema = z.ZodTypeAny;
/**
 * Shared shape for MCP tool registrations. Requires an AnySchema-compatible
 * input schema so each tool can be safely registered with the server.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: V4Schema;
  implementation: (
    context: ServerContext,
    args: unknown,
    progressToken?: string | number,
  ) => Promise<CallToolResult>;
}
