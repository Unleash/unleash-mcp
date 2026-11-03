/** The tools a report can name. Keep in sync with the tools `createServer` registers, `send_feedback` aside. */
export const reportableTools = [
  'release',
  'kill_switch',
  'experiment',
  'inspect',
  'search',
  'evaluate',
  'configure',
  'manage_flag',
  'audit',
  'docs',
] as const;

export const toolNames = [...reportableTools, 'send_feedback'] as const;

export type ToolName = (typeof toolNames)[number];
