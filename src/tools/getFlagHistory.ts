import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import { diffEventData } from '../utils/eventDiff.js';
import { jsonResult } from '../utils/toolResult.js';

const DEFAULT_LIMIT = 20;

const getFlagHistorySchema = z.object({
  featureName: z.string().min(1).describe('Feature flag name to fetch change history for'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe(
      `Max number of most recent changes to return, newest first (default ${DEFAULT_LIMIT})`,
    ),
});

type GetFlagHistoryInput = z.infer<typeof getFlagHistorySchema>;

export async function getFlagHistory(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: GetFlagHistoryInput = getFlagHistorySchema.parse(args);
    const limit = input.limit ?? DEFAULT_LIMIT;

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Fetching recent changes for "${input.featureName}"...`,
    );

    const { events, total } = await context.unleashClient.getFeatureEvents(
      input.featureName,
      limit,
    );

    const changes = events.map((event) => ({
      createdAt: event.createdAt,
      createdBy: event.createdBy,
      type: event.type,
      environment: event.environment ?? undefined,
      changes: diffEventData(event.preData, event.data),
    }));

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Fetched ${changes.length} recent change${changes.length === 1 ? '' : 's'} for "${input.featureName}"`,
    );

    context.logger.info(
      `Retrieved ${changes.length} recent change(s) for "${input.featureName}" (total ${total})`,
    );

    return jsonResult({
      success: true,
      featureName: input.featureName,
      // `total` is every change on record; `events` is the capped, newest-first slice.
      // When total > events.length, narrow the request (lower activity window) or raise limit.
      total,
      events: changes,
    });
  } catch (error) {
    return handleToolError(context, error, 'get_flag_history');
  }
}

export const getFlagHistoryTool = {
  name: 'get_flag_history',
  title: 'Get flag history',
  annotations: { readOnlyHint: true },
  description:
    'Fetch the recent change history for a feature flag as a diff of each event (who changed what, when, in which environment). Useful before editing or toggling a flag, or to explain why it is in its current state.',
  inputSchema: getFlagHistorySchema,
  implementation: getFlagHistory,
};
