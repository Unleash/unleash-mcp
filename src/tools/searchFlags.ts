import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import { jsonResult } from '../utils/toolResult.js';

const searchFlagsSchema = z.object({
  query: z.string().min(1).describe('Part of a flag name or description, or a full flag name'),
});

export async function searchFlags(context: ServerContext, args: unknown): Promise<CallToolResult> {
  try {
    const { query } = searchFlagsSchema.parse(args);
    const result = await context.unleashClient.searchFeatureFlags(query);
    return jsonResult({ success: true, ...result });
  } catch (error) {
    return handleToolError(context, error, 'search_flags');
  }
}

export const searchFlagsTool = {
  name: 'search_flags',
  title: 'Search feature flags',
  annotations: { readOnlyHint: true },
  description:
    'Search active feature flags in all projects by part of their name or description. Pass the full name of a flag to find it, with the project it is in, its type, and whether it is enabled in each environment; flags whose name or description contains it are returned too. Use it to find the projectId the other flag tools need. Returns the matching flags and how many match in total; if total is larger than the flags returned, search with a longer query.',
  inputSchema: searchFlagsSchema,
  implementation: searchFlags,
};
