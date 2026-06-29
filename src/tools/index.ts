import { cleanupFlagTool } from './cleanupFlag.js';
import { createFlagTool } from './createFlag.js';
import { detectFlagTool } from './detectFlag.js';
import { evaluateChangeTool } from './evaluateChange.js';
import { getFlagStateTool } from './getFlagState.js';
import { listFlagsTool } from './listFlags.js';
import { listProjectsTool } from './listProjects.js';
import { removeFlagStrategyTool } from './removeFlagStrategy.js';
import { setFlagRolloutTool } from './setFlagRollout.js';
import { toggleFlagEnvironmentTool } from './toggleFlagEnvironment.js';
import type { ToolDefinition } from './types.js';
import { wrapChangeTool } from './wrapChange.js';

/**
 * Single source of truth for the tools the MCP server exposes.
 *
 * Both the server factory (src/server.ts) and the documentation generator
 * (scripts/generate-tool-docs.ts) read this array, so the generated tool
 * reference cannot drift from what actually gets registered. Add a tool here
 * and it is both registered and documented; remove it and both follow.
 *
 * Order is the registration and presentation order.
 */
export const allTools: ToolDefinition[] = [
  createFlagTool,
  evaluateChangeTool,
  detectFlagTool,
  wrapChangeTool,
  cleanupFlagTool,
  setFlagRolloutTool,
  getFlagStateTool,
  listFlagsTool,
  listProjectsTool,
  toggleFlagEnvironmentTool,
  removeFlagStrategyTool,
];
