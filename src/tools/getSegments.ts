import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import { jsonResult } from '../utils/toolResult.js';

const getSegmentsSchema = z.object({
  segmentIds: z
    .array(z.number().int().positive())
    .min(1)
    .describe('Segment IDs, as listed in the segments field of a flag strategy'),
});

export async function getSegments(context: ServerContext, args: unknown): Promise<CallToolResult> {
  try {
    const { segmentIds } = getSegmentsSchema.parse(args);
    const segments = await Promise.all(
      segmentIds.map((id) => context.unleashClient.getSegment(id)),
    );
    return jsonResult({ success: true, segments });
  } catch (error) {
    return handleToolError(context, error, 'get_segments');
  }
}

export const getSegmentsTool = {
  name: 'get_segments',
  title: 'Get segments',
  annotations: { readOnlyHint: true },
  description:
    'Get the segments that flag strategies refer to by ID, for example in the segments field of a strategy from get_flag_state. Returns each segment with its name, description, project, and the constraints that decide who it includes.',
  inputSchema: getSegmentsSchema,
  implementation: getSegments,
};
