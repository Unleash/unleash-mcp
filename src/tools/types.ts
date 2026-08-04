import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { ServerContext } from '../context.js';

type V4Schema = z.ZodTypeAny;
/**
 * Shared shape for MCP tool registrations. Requires an AnySchema-compatible
 * input schema so each tool can be safely registered with the server.
 */
export interface ToolDefinition {
  name: string;
  /** Human-readable display title surfaced to MCP clients and the Connectors Directory. */
  title: string;
  description: string;
  inputSchema: V4Schema;
  /**
   * MCP tool behavior hints. `readOnlyHint` marks tools that do not modify the
   * Unleash instance; `destructiveHint` marks writes that delete or overwrite
   * existing configuration (only meaningful when `readOnlyHint` is false).
   */
  annotations: ToolAnnotations;
  implementation: (
    context: ServerContext,
    args: unknown,
    progressToken?: string | number,
  ) => Promise<CallToolResult>;
}
