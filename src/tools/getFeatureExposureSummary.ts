import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import type { FeatureExposureSummaryRow } from '../unleash/client.js';

const MAX_WINDOW_DAYS = 31;
const MAX_WINDOW_MS = MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const getFeatureExposureSummarySchema = z
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
        'Time-bucket granularity. "none" (default) returns one row per (feature, variant, enabled). "hour"/"day" add a time bucket dimension.',
      ),
    featureName: z.string().min(1).optional().describe('Exact feature flag name to filter by'),
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

type GetFeatureExposureSummaryInput = z.infer<typeof getFeatureExposureSummarySchema>;

function formatRow(row: FeatureExposureSummaryRow): string {
  const bucket = row.bucket ? `${row.bucket} ` : '';
  const variant = row.variant ? ` variant=${row.variant}` : '';
  const enabled = row.enabled === null ? '' : ` enabled=${row.enabled}`;
  return `- ${bucket}${row.featureName}${variant}${enabled} exposures=${row.exposures} users=${row.distinctUsers} sessions=${row.distinctSessions}`;
}

export async function getFeatureExposureSummary(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: GetFeatureExposureSummaryInput = getFeatureExposureSummarySchema.parse(args);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Summarizing exposures from ${input.from} to ${input.to}...`,
    );

    const response = await context.unleashClient.getFeatureExposureSummary({
      from: input.from,
      to: input.to,
      bucket: input.bucket,
      featureName: input.featureName,
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
      `Fetched ${response.rows.length} summary row${response.rows.length === 1 ? '' : 's'}`,
    );

    const filterParts: string[] = [];
    if (input.bucket && input.bucket !== 'none') filterParts.push(`bucket=${input.bucket}`);
    if (input.featureName) filterParts.push(`feature="${input.featureName}"`);
    if (input.variant) filterParts.push(`variant="${input.variant}"`);
    if (input.enabled !== undefined) filterParts.push(`enabled=${input.enabled}`);
    if (input.userId) filterParts.push(`userId="${input.userId}"`);
    if (input.sessionId) filterParts.push(`sessionId="${input.sessionId}"`);
    if (input.environment) filterParts.push(`environment="${input.environment}"`);
    if (input.appName) filterParts.push(`appName="${input.appName}"`);
    if (input.project) filterParts.push(`project="${input.project}"`);
    const filterSummary = filterParts.length > 0 ? ` with ${filterParts.join(', ')}` : '';

    const totalExposures = response.rows.reduce((sum, row) => sum + row.exposures, 0);

    const headerLine = `Found ${response.rows.length} summary row${response.rows.length === 1 ? '' : 's'} (${totalExposures} total exposures) between ${input.from} and ${input.to}${filterSummary}.`;

    const rowLines =
      response.rows.length > 0
        ? response.rows.map(formatRow).join('\n')
        : 'No exposures matched the query.';

    const summaryText = `${headerLine}\n${rowLines}`;

    context.logger.info(
      `Fetched ${response.rows.length} exposure summary rows${input.featureName ? ` for feature "${input.featureName}"` : ''}`,
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
          featureName: input.featureName,
          variant: input.variant,
          enabled: input.enabled,
          userId: input.userId,
          sessionId: input.sessionId,
          environment: input.environment,
          appName: input.appName,
          project: input.project,
          limit: input.limit ?? 100,
        },
        rowCount: response.rows.length,
        totalExposures,
        rows: response.rows,
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'get_feature_exposure_summary');
  }
}

export const getFeatureExposureSummaryTool = {
  name: 'get_feature_exposure_summary',
  description:
    'Aggregate Unleash impression-event exposures within a time window of up to 31 days. Returns one row per (feature, variant, enabled) — or per (bucket, feature, variant, enabled) when bucket=hour|day — with exposure, distinct-user, and distinct-session counts. Useful for audit totals and rollout visibility. Requires the Unleash Enterprise impression-events API.',
  inputSchema: getFeatureExposureSummarySchema,
  implementation: getFeatureExposureSummary,
};
