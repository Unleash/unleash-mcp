import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import type { CustomEventSummaryRow } from '../unleash/client.js';

const MAX_WINDOW_DAYS = 31;
const MAX_WINDOW_MS = MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const getCustomEventSummarySchema = z
  .object({
    from: z
      .string()
      .datetime({ offset: true })
      .describe('Inclusive ISO-8601 start of the time window'),
    to: z
      .string()
      .datetime({ offset: true })
      .describe('Inclusive ISO-8601 end of the time window. Window must be ≤ 31 days from `from`'),
    bucket: z
      .enum(['none', 'hour', 'day'])
      .optional()
      .describe(
        'Time-bucket granularity. "none" (default) returns one row per eventName. "hour"/"day" add a time bucket dimension for trend/anomaly analysis.',
      ),
    eventName: z.string().min(1).optional().describe('Exact custom event name to filter by'),
    userId: z.string().min(1).optional().describe('SDK-reported end-user id (exact match)'),
    sessionId: z.string().min(1).optional().describe('SDK session id (exact match)'),
    environment: z.string().min(1).optional().describe('Environment name (exact match)'),
    appName: z.string().min(1).optional().describe('SDK appName reported by the client'),
    project: z.string().min(1).optional().describe('Project id (exact match)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of summary rows to return (1-1000, default 100)'),
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

type GetCustomEventSummaryInput = z.infer<typeof getCustomEventSummarySchema>;

function formatRow(row: CustomEventSummaryRow): string {
  const bucket = row.bucket ? `${row.bucket} ` : '';
  return `- ${bucket}${row.eventName} events=${row.events} users=${row.distinctUsers} sessions=${row.distinctSessions}`;
}

export async function getCustomEventSummary(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: GetCustomEventSummaryInput = getCustomEventSummarySchema.parse(args);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Summarizing custom events from ${input.from} to ${input.to}...`,
    );

    const response = await context.unleashClient.getCustomEventSummary({
      from: input.from,
      to: input.to,
      bucket: input.bucket,
      eventName: input.eventName,
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
      `Fetched ${response.rows.length} summary row${response.rows.length === 1 ? '' : 's'}`,
    );

    const filterParts: string[] = [];
    if (input.bucket && input.bucket !== 'none') filterParts.push(`bucket=${input.bucket}`);
    if (input.eventName) filterParts.push(`eventName="${input.eventName}"`);
    if (input.userId) filterParts.push(`userId="${input.userId}"`);
    if (input.sessionId) filterParts.push(`sessionId="${input.sessionId}"`);
    if (input.environment) filterParts.push(`environment="${input.environment}"`);
    if (input.appName) filterParts.push(`appName="${input.appName}"`);
    if (input.project) filterParts.push(`project="${input.project}"`);
    const filterSummary = filterParts.length > 0 ? ` with ${filterParts.join(', ')}` : '';

    const totalEvents = response.rows.reduce((sum, row) => sum + row.events, 0);

    const headerLine = `Found ${response.rows.length} summary row${response.rows.length === 1 ? '' : 's'} (${totalEvents} total events) between ${input.from} and ${input.to}${filterSummary}.`;

    const rowLines =
      response.rows.length > 0
        ? response.rows.map(formatRow).join('\n')
        : 'No custom events matched the query.';

    const summaryText = `${headerLine}\n${rowLines}`;

    context.logger.info(
      `Fetched ${response.rows.length} custom event summary rows${input.eventName ? ` for event "${input.eventName}"` : ''}`,
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
          bucket: input.bucket ?? 'none',
          eventName: input.eventName,
          userId: input.userId,
          sessionId: input.sessionId,
          environment: input.environment,
          appName: input.appName,
          project: input.project,
          limit: input.limit ?? 100,
        },
        rowCount: response.rows.length,
        totalEvents,
        rows: response.rows,
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'get_custom_event_summary');
  }
}

export const getCustomEventSummaryTool = {
  name: 'get_custom_event_summary',
  description:
    'Aggregate Unleash custom impression events within a time window of up to 31 days. Returns one row per eventName — or per (bucket, eventName) when bucket=hour|day — with event counts plus distinct user and session counts. Useful for: discovering what custom event names are being emitted, spotting hourly/daily trends or post-deploy spikes, computing baseline distinct-user activity for a given event, and detecting abnormal event volume from a single userId/sessionId (bot/abuse check). Requires the Unleash Enterprise impression-events API.',
  inputSchema: getCustomEventSummarySchema,
  implementation: getCustomEventSummary,
};
