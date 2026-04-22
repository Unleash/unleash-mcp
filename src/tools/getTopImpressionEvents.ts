import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import type { TopImpressionEventsRow } from '../unleash/client.js';

const MAX_WINDOW_DAYS = 31;
const MAX_WINDOW_MS = MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const getTopImpressionEventsSchema = z
  .object({
    from: z
      .string()
      .datetime({ offset: true })
      .describe('Inclusive ISO-8601 start of the time window'),
    to: z
      .string()
      .datetime({ offset: true })
      .describe('Inclusive ISO-8601 end of the time window. Window must be ≤ 31 days from `from`'),
    groupBy: z
      .enum([
        'featureName',
        'variant',
        'eventName',
        'eventType',
        'userId',
        'sessionId',
        'appName',
        'environment',
      ])
      .describe(
        'Dimension to rank by. featureName/variant rank flags; userId/sessionId rank actors (useful for bot detection); appName/environment rank traffic sources; eventName/eventType rank custom events.',
      ),
    featureName: z.string().min(1).optional().describe('Exact feature flag name to filter by'),
    eventName: z.string().min(1).optional().describe('Exact custom event name to filter by'),
    variant: z.string().min(1).optional().describe('Exact variant name to filter by'),
    enabled: z
      .boolean()
      .optional()
      .describe('Filter by the boolean value reported by the SDK evaluation'),
    userId: z.string().min(1).optional().describe('SDK-reported end-user id (exact match)'),
    sessionId: z.string().min(1).optional().describe('SDK session id (exact match)'),
    environment: z.string().min(1).optional().describe('Environment name (exact match)'),
    appName: z.string().min(1).optional().describe('SDK appName reported by the client'),
    project: z.string().min(1).optional().describe('Project id (exact match)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of ranked rows to return (1-100, default 20)'),
  })
  .superRefine((value, ctx) => {
    const fromMs = Date.parse(value.from);
    const toMs = Date.parse(value.to);

    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      return;
    }

    if (fromMs > toMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: '`to` must be greater than or equal to `from`',
      });
      return;
    }

    if (toMs - fromMs > MAX_WINDOW_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `Window between \`from\` and \`to\` must be ${MAX_WINDOW_DAYS} days or less`,
      });
    }
  });

type GetTopImpressionEventsInput = z.infer<typeof getTopImpressionEventsSchema>;

function formatRow(row: TopImpressionEventsRow, rank: number): string {
  return `${rank}. ${row.key} — ${row.count}`;
}

export async function getTopImpressionEvents(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: GetTopImpressionEventsInput = getTopImpressionEventsSchema.parse(args);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Ranking top ${input.groupBy} from ${input.from} to ${input.to}...`,
    );

    const response = await context.unleashClient.getTopImpressionEvents({
      from: input.from,
      to: input.to,
      groupBy: input.groupBy,
      featureName: input.featureName,
      eventName: input.eventName,
      variant: input.variant,
      enabled: input.enabled,
      userId: input.userId,
      sessionId: input.sessionId,
      environment: input.environment,
      appName: input.appName,
      project: input.project,
      limit: input.limit,
    });

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Ranked ${response.rows.length} ${input.groupBy} value${response.rows.length === 1 ? '' : 's'}`,
    );

    const filterParts: string[] = [];
    if (input.featureName) filterParts.push(`feature="${input.featureName}"`);
    if (input.eventName) filterParts.push(`eventName="${input.eventName}"`);
    if (input.variant) filterParts.push(`variant="${input.variant}"`);
    if (input.enabled !== undefined) filterParts.push(`enabled=${input.enabled}`);
    if (input.userId) filterParts.push(`userId="${input.userId}"`);
    if (input.sessionId) filterParts.push(`sessionId="${input.sessionId}"`);
    if (input.environment) filterParts.push(`environment="${input.environment}"`);
    if (input.appName) filterParts.push(`appName="${input.appName}"`);
    if (input.project) filterParts.push(`project="${input.project}"`);
    const filterSummary = filterParts.length > 0 ? ` with ${filterParts.join(', ')}` : '';

    const totalCount = response.rows.reduce((sum, row) => sum + row.count, 0);

    const headerLine = `Top ${response.rows.length} ${input.groupBy} value${response.rows.length === 1 ? '' : 's'} (${totalCount} total events) between ${input.from} and ${input.to}${filterSummary}.`;

    const rowLines =
      response.rows.length > 0
        ? response.rows.map((row, index) => formatRow(row, index + 1)).join('\n')
        : 'No events matched the query.';

    const summaryText = `${headerLine}\n${rowLines}`;

    context.logger.info(
      `Ranked ${response.rows.length} rows by ${input.groupBy}${input.featureName ? ` for feature "${input.featureName}"` : ''}`,
    );

    return {
      content: [
        {
          type: 'text',
          text: summaryText,
        },
      ],
      structuredContent: {
        success: true,
        query: {
          from: input.from,
          to: input.to,
          groupBy: input.groupBy,
          featureName: input.featureName,
          eventName: input.eventName,
          variant: input.variant,
          enabled: input.enabled,
          userId: input.userId,
          sessionId: input.sessionId,
          environment: input.environment,
          appName: input.appName,
          project: input.project,
          limit: input.limit ?? 20,
        },
        groupBy: response.groupBy,
        rowCount: response.rows.length,
        totalCount,
        rows: response.rows,
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'get_top_impression_events');
  }
}

export const getTopImpressionEventsTool = {
  name: 'get_top_impression_events',
  description:
    'Rank the top-N values for a grouping dimension from Unleash impression events within a time window of up to 31 days. groupBy supports featureName, variant, eventName, eventType, userId, sessionId, appName, and environment. Useful for: noisiest flags/events, highest-traffic apps, most-active users (bot detection), and variant traffic breakdown under a featureName filter. Requires the Unleash Enterprise impression-events API.',
  inputSchema: getTopImpressionEventsSchema,
  implementation: getTopImpressionEvents,
};
