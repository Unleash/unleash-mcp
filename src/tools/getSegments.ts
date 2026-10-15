import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext, toolErrorPayload } from '../context.js';
import type { Segment } from '../unleash/client.js';
import type { NormalizedError } from '../utils/errors.js';
import { jsonResult } from '../utils/toolResult.js';

const getSegmentsSchema = z.object({
  segmentIds: z
    .array(z.number().int().positive())
    .min(1)
    // Unleash allows 5 segments per strategy by default, so 20 covers a flag with several
    // segmented strategies while stopping a runaway list from firing one request per entry.
    .max(20)
    .describe('Segment IDs, as listed in the segments field of a flag strategy'),
});

export async function getSegments(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const ids = [...new Set(getSegmentsSchema.parse(args).segmentIds)];

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Fetching ${ids.length} segment${ids.length === 1 ? '' : 's'}...`,
    );

    const results = await Promise.allSettled(ids.map((id) => context.unleashClient.getSegment(id)));

    const segments: Segment[] = [];
    const errors: Array<{ id: number; error: NormalizedError }> = [];
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        segments.push(result.value);
      } else {
        const { error } = toolErrorPayload(context, result.reason, 'get_segments');
        errors.push({ id: ids[index], error });
      }
    }

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Fetched ${segments.length} of ${ids.length} segment${ids.length === 1 ? '' : 's'}`,
    );

    context.logger.info(`Fetched ${segments.length}/${ids.length} segment(s)`);

    if (segments.length === 0) {
      return { isError: true, ...jsonResult({ success: false, errors }) };
    }
    return jsonResult({ success: true, segments, errors });
  } catch (error) {
    return handleToolError(context, error, 'get_segments');
  }
}

export const getSegmentsTool = {
  name: 'get_segments',
  title: 'Get segments',
  annotations: { readOnlyHint: true },
  description:
    'Get the segments that flag strategies refer to by ID, for example in the segments field of a strategy from get_flag_state. Returns each segment with its name, description, project, and the constraints that decide who it includes, and lists the IDs that could not be fetched under errors.',
  inputSchema: getSegmentsSchema,
  implementation: getSegments,
};
