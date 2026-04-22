import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import type { AttributionRow } from '../unleash/client.js';

const MAX_WINDOW_DAYS = 31;
const MAX_WINDOW_MS = MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const getFeatureAttributionSchema = z
  .object({
    from: z
      .string()
      .datetime({ offset: true })
      .describe('Inclusive ISO-8601 start of the exposure time window'),
    to: z
      .string()
      .datetime({ offset: true })
      .describe('Inclusive ISO-8601 end of the exposure time window. Window must be ≤ 31 days.'),
    featureName: z
      .string()
      .min(1)
      .describe('Required feature flag whose exposures (isEnabled/getVariant) are attributed'),
    eventName: z
      .string()
      .min(1)
      .describe('Required custom event name to count as a conversion (e.g. checkout_completed)'),
    variant: z.string().min(1).optional().describe('Filter exposures to a single variant'),
    enabled: z
      .boolean()
      .optional()
      .describe('Filter exposures by the boolean value the SDK reported'),
    userId: z.string().min(1).optional().describe('SDK-reported end-user id (exact match)'),
    sessionId: z.string().min(1).optional().describe('SDK session id (exact match)'),
    environment: z.string().min(1).optional().describe('Environment name (exact match)'),
    appName: z.string().min(1).optional().describe('SDK appName reported by the client'),
    project: z.string().min(1).optional().describe('Project id (exact match)'),
    windowMinutes: z
      .number()
      .int()
      .min(1)
      .max(60 * 24 * 31)
      .optional()
      .describe(
        'Conversion window in minutes after exposure. Default 60. Conversions outside this window are not attributed.',
      ),
    attributionMode: z
      .enum(['first', 'last'])
      .optional()
      .describe(
        'Which exposure timestamp anchors each user. "first" (default) uses earliest exposure; "last" uses latest.',
      ),
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

type GetFeatureAttributionInput = z.infer<typeof getFeatureAttributionSchema>;

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return 'n/a';
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${minutes.toFixed(1)}m`;
  }
  return `${(minutes / 60).toFixed(1)}h`;
}

function formatRow(row: AttributionRow): string {
  const label = row.variant ?? '(no variant)';
  return `- ${label}: ${row.convertedUsers}/${row.exposedUsers} exposed users converted (${formatPercent(row.conversionRate)}), avg time-to-convert=${formatDuration(row.avgTimeToConvertSec)}`;
}

export async function getFeatureAttribution(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: GetFeatureAttributionInput = getFeatureAttributionSchema.parse(args);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Attributing ${input.eventName} conversions for feature ${input.featureName}...`,
    );

    const response = await context.unleashClient.getAttribution({
      from: input.from,
      to: input.to,
      featureName: input.featureName,
      eventName: input.eventName,
      variant: input.variant,
      enabled: input.enabled,
      userId: input.userId,
      sessionId: input.sessionId,
      environment: input.environment,
      appName: input.appName,
      project: input.project,
      windowMinutes: input.windowMinutes,
      attributionMode: input.attributionMode,
    });

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Attributed ${response.rows.length} variant${response.rows.length === 1 ? '' : 's'}`,
    );

    const totalExposed = response.rows.reduce((sum, row) => sum + row.exposedUsers, 0);
    const totalConverted = response.rows.reduce((sum, row) => sum + row.convertedUsers, 0);
    const overallRate = totalExposed > 0 ? totalConverted / totalExposed : 0;

    const filterParts: string[] = [];
    if (input.variant) filterParts.push(`variant="${input.variant}"`);
    if (input.enabled !== undefined) filterParts.push(`enabled=${input.enabled}`);
    if (input.userId) filterParts.push(`userId="${input.userId}"`);
    if (input.sessionId) filterParts.push(`sessionId="${input.sessionId}"`);
    if (input.environment) filterParts.push(`environment="${input.environment}"`);
    if (input.appName) filterParts.push(`appName="${input.appName}"`);
    if (input.project) filterParts.push(`project="${input.project}"`);
    const filterSummary = filterParts.length > 0 ? ` (${filterParts.join(', ')})` : '';

    const headerLine = `Attribution for feature "${response.featureName}" → event "${response.targetEventName}" within ${response.windowMinutes}-minute window, exposure window ${input.from} → ${input.to}${filterSummary}.`;
    const totalsLine = `Overall: ${totalConverted}/${totalExposed} converted (${formatPercent(overallRate)}) across ${response.rows.length} variant${response.rows.length === 1 ? '' : 's'}.`;

    const rowLines =
      response.rows.length > 0
        ? response.rows.map(formatRow).join('\n')
        : 'No exposures matched the query — nothing to attribute.';

    const summaryText = `${headerLine}\n${totalsLine}\n${rowLines}`;

    context.logger.info(
      `Attribution for feature "${input.featureName}" → "${input.eventName}": ${response.rows.length} variant rows, ${totalConverted}/${totalExposed} converted`,
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
          featureName: input.featureName,
          eventName: input.eventName,
          variant: input.variant,
          enabled: input.enabled,
          userId: input.userId,
          sessionId: input.sessionId,
          environment: input.environment,
          appName: input.appName,
          project: input.project,
          windowMinutes: response.windowMinutes,
          attributionMode: input.attributionMode ?? 'first',
        },
        featureName: response.featureName,
        targetEventName: response.targetEventName,
        windowMinutes: response.windowMinutes,
        rowCount: response.rows.length,
        totals: {
          exposedUsers: totalExposed,
          convertedUsers: totalConverted,
          conversionRate: overallRate,
        },
        rows: response.rows,
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'get_feature_attribution');
  }
}

export const getFeatureAttributionTool = {
  name: 'get_feature_attribution',
  description:
    'Measure conversion lift per variant for an Unleash feature flag: for each variant, count exposed users and what percentage fired a target custom event within a configurable window after exposure. Answers A/B questions like "does treatment convert better than control?". Requires the Unleash Enterprise impression-events API. Exposure events and the target custom event must share a userId for attribution to work.',
  inputSchema: getFeatureAttributionSchema,
  implementation: getFeatureAttribution,
};
