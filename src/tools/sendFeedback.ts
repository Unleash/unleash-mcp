import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import { type ClientInfo, sanitize } from '../unleash/attribution.js';
import { VERSION } from '../version.js';

/**
 * send_feedback lets the assistant report moments where this MCP fell short:
 * a failed tool call, a request no tool covers, or a result that was not what
 * the user expected.
 *
 * The tool validates its input, builds an allowlisted report, and posts it as
 * the `areasForImprovement` text through `FeedbackHttpClient`, which owns the
 * wire format of the hosted Unleash feedback endpoint (DX-4860). A failed
 * transmission surfaces as a tool error via `handleToolError`; there is no
 * local fallback. The tool is not registered until consent lands (DX-4859).
 */

const ISSUE_TYPES = ['tool_error', 'unsupported_action', 'unexpected_result'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

const MAX_SUMMARY_LENGTH = 500;
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const sendFeedbackSchema = z.object({
  issueType: z
    .enum(ISSUE_TYPES)
    .describe(
      'tool_error: a tool call returned an error. unsupported_action: the user asked for something this MCP cannot do. unexpected_result: a tool succeeded but the result was not what was expected.',
    ),
  tool: z
    .string()
    .regex(TOOL_NAME_PATTERN, 'Expected an MCP tool name such as create_flag')
    .max(64)
    .optional()
    .describe('Name of the MCP tool involved, e.g. create_flag. Omit for unsupported requests.'),
  errorCode: z
    .string()
    .regex(ERROR_CODE_PATTERN, 'Expected a normalized error code such as HTTP_403')
    .max(64)
    .optional()
    .describe(
      'Normalized error code from the failed tool result, e.g. HTTP_403 or VALIDATION_ERROR. Never the error message itself.',
    ),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(MAX_SUMMARY_LENGTH)
    .describe(
      'One or two sentences describing what went wrong or what was requested. Do not include flag names, project IDs, code, URLs, or tokens.',
    ),
});

export type SendFeedbackInput = z.infer<typeof sendFeedbackSchema>;

/**
 * Structured report carried inside `areasForImprovement`. Only these
 * allowlisted fields are ever reported; raw error messages are excluded because
 * Admin API messages embed flag and project names.
 */
export interface FeedbackReport {
  issueType: IssueType;
  summary: string;
  tool: string | null;
  errorCode: string | null;
  mcpVersion: string;
  client?: string;
  clientVersion?: string;
}

interface FeedbackSource {
  mcpVersion: string;
  clientInfo: ClientInfo | undefined;
}

function describeClient(
  clientInfo: ClientInfo | undefined,
): Pick<FeedbackReport, 'client' | 'clientVersion'> {
  if (!clientInfo) return {};
  const client = sanitize(clientInfo.name);
  const clientVersion = sanitize(clientInfo.version);
  if (!client || !clientVersion) return {};
  return { client, clientVersion };
}

function buildFeedbackReport(input: SendFeedbackInput, source: FeedbackSource): FeedbackReport {
  return {
    issueType: input.issueType,
    summary: input.summary,
    tool: input.tool ?? null,
    errorCode: input.errorCode ?? null,
    mcpVersion: source.mcpVersion,
    ...describeClient(source.clientInfo),
  };
}

export async function sendFeedback(
  context: ServerContext,
  args: unknown,
  _progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input = sendFeedbackSchema.parse(args);
    const clientInfo = context.config.server.attributionEnabled
      ? context.getClientInfo()
      : undefined;
    const report = buildFeedbackReport(input, { mcpVersion: VERSION, clientInfo });
    const areasForImprovement = JSON.stringify(report);

    const dryRun = context.config.server.dryRun;
    if (!dryRun) {
      await context.feedbackClient.send(areasForImprovement);
    }
    context.logger.debug(`[send_feedback] ${dryRun ? 'dry run' : 'sent'} ${areasForImprovement}`);

    const message = dryRun
      ? 'Executed in dry run. Feedback not sent.'
      : 'Feedback sent to Unleash.';

    return {
      content: [
        {
          type: 'text',
          text: `${message}\n${JSON.stringify(report, null, 2)}`,
        },
      ],
      structuredContent: {
        success: true,
        dryRun,
        areasForImprovement,
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'send_feedback');
  }
}

export const sendFeedbackTool = {
  name: 'send_feedback',
  title: 'Send MCP feedback',
  annotations: { readOnlyHint: false, destructiveHint: false },
  description: `Report a moment where this MCP fell short.

When to call it:
- tool_error: a tool result came back with isError; do not call tool on authentication errors - 401 or 403 statuses.
- unsupported_action: the user asked for something no tool can fulfil
- unexpected_result: a tool succeeded but its result was not what was expected

Call it before replying to the user, and never after a successful tool call. Never call it to report a failure of send_feedback itself.

What is recorded (allowlisted only):
- issue type, tool name, normalized error code
- MCP version, client name and version
- a short summary

Do not put flag names, project IDs, code, URLs, or tokens in the summary.`,
  inputSchema: sendFeedbackSchema,
  implementation: sendFeedback,
};
