import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import { VERSION } from '../version.js';

export const ISSUE_TYPES = ['tool_error', 'unsupported_action', 'unexpected_result'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

const MAX_SUMMARY_LENGTH = 500;

const sendFeedbackSchema = z.object({
  issueType: z
    .enum(ISSUE_TYPES)
    .describe(
      'tool_error: a tool call returned an error. unsupported_action: the user asked for something this MCP cannot do. unexpected_result: a tool succeeded but the result was not what was expected.',
    ),
  tool: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .describe('Name of the MCP tool involved, e.g. create_flag. Omit for unsupported requests.'),
  errorCode: z
    .string()
    .trim()
    .max(64)
    .optional()
    .describe(
      'Normalized error code from the failed tool result, e.g. HTTP_403 or VALIDATION_ERROR.',
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

type SendFeedbackInput = z.infer<typeof sendFeedbackSchema>;

/**
 * Allowlisted feedback record. Only these fields are ever reported; raw error
 * messages are never included because Admin API messages embed flag and
 * project names.
 */
export interface FeedbackPayload {
  category: 'mcp';
  userType: string;
  areasForImprovement: {
    issueType: IssueType;
    tool?: string;
    errorCode?: string;
    mcpVersion: string;
    summary: string;
  };
}

export function buildFeedbackPayload(
  input: SendFeedbackInput,
  context: ServerContext,
): FeedbackPayload {
  const clientInfo = context.getClientInfo?.();
  const userType = clientInfo ? `${clientInfo.name}/${clientInfo.version}` : 'unknown';

  return {
    category: 'mcp',
    userType,
    areasForImprovement: {
      issueType: input.issueType,
      tool: input.tool,
      errorCode: input.errorCode,
      mcpVersion: VERSION,
      summary: input.summary,
    },
  };
}

export async function sendFeedback(
  context: ServerContext,
  args: unknown,
  _progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input = sendFeedbackSchema.parse(args);
    const payload = buildFeedbackPayload(input, context);
    const serialized = JSON.stringify(payload);

    // Simplified implementation: feedback is only printed, never transmitted.
    context.logger.info(`[send_feedback] ${serialized}`);

    return {
      content: [
        {
          type: 'text',
          text: `Feedback recorded locally (not transmitted):\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
      structuredContent: {
        success: true,
        transmitted: false,
        feedback: payload,
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
  description:
    'REQUIRED whenever the user asks this MCP to do something it cannot do (for example ordering food, deploying code, or any request unrelated to feature flags) or whenever a tool result has isError. Call it BEFORE replying to the user, even when you will not call any other tool and would otherwise just explain the limitation. Never call it after a successful tool call. It records anonymized, allowlisted data only: issue type, tool name, normalized error code, MCP version, and a short summary. Do not include flag names, project IDs, code, URLs, or tokens in the summary. This version only logs the feedback locally and does not transmit it anywhere.',
  inputSchema: sendFeedbackSchema,
  implementation: sendFeedback,
};
