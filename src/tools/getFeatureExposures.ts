import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import type { FeatureExposureRow } from '../unleash/client.js';

const MAX_WINDOW_DAYS = 31;
const MAX_WINDOW_MS = MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const getFeatureExposuresSchema = z
  .object({
    from: z
      .string()
      .datetime({ offset: true })
      .describe('Inclusive ISO-8601 start of the time window'),
    to: z
      .string()
      .datetime({ offset: true })
      .describe('Inclusive ISO-8601 end of the time window. Window must be ≤ 31 days from `from`'),
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

type GetFeatureExposuresInput = z.infer<typeof getFeatureExposuresSchema>;

function formatRow(row: FeatureExposureRow): string {
  const eventType = row.variant !== null ? 'getVariant' : 'isEnabled';
  const variant = row.variant ? ` variant=${row.variant}` : '';
  const enabled = row.enabled === null ? '' : ` enabled=${row.enabled}`;
  const user = row.userId ? ` user=${row.userId}` : '';
  return `- ${row.timestamp} ${eventType} ${row.featureName}${variant}${enabled}${user} env=${row.environment} app=${row.appName} project=${row.project}`;
}

export async function getFeatureExposures(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: GetFeatureExposuresInput = getFeatureExposuresSchema.parse(args);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Fetching exposures from ${input.from} to ${input.to}...`,
    );

    const response = await context.unleashClient.getFeatureExposures({
      from: input.from,
      to: input.to,
      featureName: input.featureName,
      variant: input.variant,
      enabled: input.enabled,
      userId: input.userId,
      sessionId: input.sessionId,
      environment: input.environment,
      appName: input.appName,
      project: input.project,
      limit: input.limit,
      offset: input.offset,
    });

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Fetched ${response.rows.length} exposure row${response.rows.length === 1 ? '' : 's'}`,
    );

    const filterParts: string[] = [];
    if (input.featureName) filterParts.push(`feature="${input.featureName}"`);
    if (input.variant) filterParts.push(`variant="${input.variant}"`);
    if (input.enabled !== undefined) filterParts.push(`enabled=${input.enabled}`);
    if (input.userId) filterParts.push(`userId="${input.userId}"`);
    if (input.sessionId) filterParts.push(`sessionId="${input.sessionId}"`);
    if (input.environment) filterParts.push(`environment="${input.environment}"`);
    if (input.appName) filterParts.push(`appName="${input.appName}"`);
    if (input.project) filterParts.push(`project="${input.project}"`);
    const filterSummary = filterParts.length > 0 ? ` with ${filterParts.join(', ')}` : '';

    const truncationNote = response.truncated
      ? ` (truncated — hit limit of ${input.limit ?? 100}, narrow the window or filters for more)`
      : '';

    const headerLine = `Found ${response.rows.length} exposure row${response.rows.length === 1 ? '' : 's'} between ${input.from} and ${input.to}${filterSummary}${truncationNote}.`;

    const rowLines =
      response.rows.length > 0
        ? response.rows.map(formatRow).join('\n')
        : 'No exposures matched the query.';

    const summaryText = `${headerLine}\n${rowLines}`;

    context.logger.info(
      `Fetched ${response.rows.length} exposure rows${input.featureName ? ` for feature "${input.featureName}"` : ''}${response.truncated ? ' (truncated)' : ''}`,
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
          variant: input.variant,
          enabled: input.enabled,
          userId: input.userId,
          sessionId: input.sessionId,
          environment: input.environment,
          appName: input.appName,
          project: input.project,
          limit: input.limit ?? 100,
          offset: input.offset ?? 0,
        },
        rowCount: response.rows.length,
        truncated: response.truncated,
        rows: response.rows,
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'get_feature_exposures');
  }
}

export const getFeatureExposuresTool = {
  name: 'get_feature_exposures',
  description:
    'Query Unleash impression-event exposures (SDK isEnabled / getVariant evaluations) within a time window of up to 31 days. Useful for verifying a flag is being evaluated, finding users who saw a variant, or auditing recent flag activity. Requires the Unleash Enterprise impression-events API.',
  inputSchema: getFeatureExposuresSchema,
  implementation: getFeatureExposures,
};
