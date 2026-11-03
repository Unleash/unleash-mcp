import { reportableTools } from './sendFeedback/sendFeedbackInput.ts';

export const toolNames = [...reportableTools, 'send_feedback'] as const;

export type ToolName = (typeof toolNames)[number];
