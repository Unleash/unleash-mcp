export const toolNames = [
  'release',
  'experiment',
  'kill_switch',
  'inspect',
  'search',
  'evaluate',
  'configure',
  'manage_flag',
  'audit',
  'docs',
  'send_feedback',
] as const;

export type ToolName = (typeof toolNames)[number];
