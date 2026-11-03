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
