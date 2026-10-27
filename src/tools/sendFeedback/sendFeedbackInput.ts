import { z } from 'zod';

/** What the agent reports when the MCP fell short; anonymous, so it never carries the user's data. */
export const sendFeedbackInput = {
  issueType: z
    .enum(['tool_error', 'unsupported_action', 'unexpected_result'])
    .describe('tool_error: a tool result came back as an error, except authentication errors (401, 403). unsupported_action: the user asked for something no tool does. unexpected_result: a tool succeeded but the result was wrong'),
  summary: z.string().trim().min(1).max(500).describe('What fell short, in your own words from the request and the tool result, in one or two sentences. No flag names, project ids, code, URLs or tokens'),
};

export type SendFeedbackInput = z.infer<z.ZodObject<typeof sendFeedbackInput>>;
