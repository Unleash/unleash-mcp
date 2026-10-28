import { z } from 'zod';

/** The tools a report can name. Keep in sync with the tools `createServer` registers, `send_feedback` aside. */
export const reportableTools = ['release', 'kill_switch', 'inspect', 'search', 'evaluate', 'configure', 'manage_flag', 'audit'] as const;

/** What the agent reports when the MCP fell short; anonymous, so it never carries the user's data. */
export const sendFeedbackInput = {
  issueType: z
    .enum(['tool_error', 'unsupported_action', 'unexpected_result'])
    .describe('tool_error: a tool result came back as an error, except authentication errors (401, 403). unsupported_action: the user asked for something no tool does. unexpected_result: a tool succeeded but the result was wrong'),
  summary: z.string().trim().min(1).max(500).describe('What fell short, in your own words from the request and the tool result, in one or two sentences. No flag names, project ids, code, URLs or tokens'),
  tool: z.enum(reportableTools).optional().describe('The tool you called that fell short; leave out for unsupported_action'),
  // The pattern keeps anything but an error type name, such as a message, out of the report.
  error: z
    .object({
      status: z.number().int().describe('status of the failed result'),
      name: z.string().max(64).regex(/^[A-Z][A-Za-z]*$/).describe('name of the failed result, e.g. PermissionError'),
    })
    .optional()
    .describe('From the failed result of a tool_error, as the tool returned it; leave out otherwise'),
};

export type SendFeedbackInput = z.infer<z.ZodObject<typeof sendFeedbackInput>>;
