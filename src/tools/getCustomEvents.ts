import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import type { CustomEventRow } from '../unleash/client.js';

const MAX_WINDOW_DAYS = 31;
const MAX_WINDOW_MS = MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 100;

const getCustomEventsSchema = z
  .object({
    from: z
      .string()
      .datetime({ offset: true })
      .describe('Inclusive ISO-8601 start of the time window'),
    to: z
      .string()
      .datetime({ offset: true })
      .describe('Inclusive ISO-8601 end of the time window. Window must be ≤ 31 days from `from`'),
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
      .describe('Maximum number of rows to return (1-1000, default 100)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of rows to skip for pagination (default 0)'),
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

type GetCustomEventsInput = z.infer<typeof getCustomEventsSchema>;

function hasPayload(payload: Record<string, unknown> | undefined): boolean {
  return !!payload && Object.keys(payload).length > 0;
}

function formatRow(row: CustomEventRow): string {
  const user = row.userId ? ` user=${row.userId}` : '';
  const session = row.sessionId ? ` session=${row.sessionId}` : '';
  const environment = row.environment ? ` env=${row.environment}` : '';
  const app = row.appName ? ` app=${row.appName}` : '';
  const project = row.project ? ` project=${row.project}` : '';
  const payload = hasPayload(row.payload) ? ` payload=${JSON.stringify(row.payload)}` : '';
  return `- ${row.timestamp} ${row.eventName}${user}${session}${environment}${app}${project}${payload}`;
}

export async function getCustomEvents(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: GetCustomEventsInput = getCustomEventsSchema.parse(args);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Fetching custom events from ${input.from} to ${input.to}...`,
    );

    const response = await context.unleashClient.getCustomEvents({
      from: input.from,
      to: input.to,
      eventName: input.eventName,
      userId: input.userId,
      sessionId: input.sessionId,
      environment: input.environment,
      appName: input.appName,
      project: input.project,
      limit: input.limit,
      offset: input.offset,
    });

    const effectiveLimit = input.limit ?? DEFAULT_LIMIT;
    const truncated = response.truncated || response.rows.length >= effectiveLimit;

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Fetched ${response.rows.length} custom event${response.rows.length === 1 ? '' : 's'}`,
    );

    const filterParts: string[] = [];
    if (input.eventName) filterParts.push(`eventName="${input.eventName}"`);
    if (input.userId) filterParts.push(`userId="${input.userId}"`);
    if (input.sessionId) filterParts.push(`sessionId="${input.sessionId}"`);
    if (input.environment) filterParts.push(`environment="${input.environment}"`);
    if (input.appName) filterParts.push(`appName="${input.appName}"`);
    if (input.project) filterParts.push(`project="${input.project}"`);
    const filterSummary = filterParts.length > 0 ? ` with ${filterParts.join(', ')}` : '';

    const truncationNote = truncated
      ? ` (truncated — hit limit of ${effectiveLimit}, narrow the window or filters or raise \`limit\` for more)`
      : '';

    const headerLine = `Found ${response.rows.length} custom event${response.rows.length === 1 ? '' : 's'} between ${input.from} and ${input.to}${filterSummary}${truncationNote}.`;

    const rowLines =
      response.rows.length > 0
        ? response.rows.map(formatRow).join('\n')
        : 'No custom events matched the query.';

    const summaryText = `${headerLine}\n${rowLines}`;

    context.logger.info(
      `Fetched ${response.rows.length} custom event rows${input.eventName ? ` for event "${input.eventName}"` : ''}${truncated ? ' (truncated)' : ''}`,
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
          eventName: input.eventName,
          userId: input.userId,
          sessionId: input.sessionId,
          environment: input.environment,
          appName: input.appName,
          project: input.project,
          limit: effectiveLimit,
          offset: input.offset ?? 0,
        },
        rowCount: response.rows.length,
        truncated,
        rows: response.rows,
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'get_custom_events');
  }
}

export const getCustomEventsTool = {
  name: 'get_custom_events',
  description:
    'Query raw Unleash custom impression events (user-defined events sent via the SDK) within a time window of up to 31 days. Useful for replaying a user/session timeline, inspecting event payloads, or auditing recent custom-event traffic. Filter by eventName, userId, sessionId, environment, appName, or project. Requires the Unleash Enterprise impression-events API.',
  inputSchema: getCustomEventsSchema,
  implementation: getCustomEvents,
};
