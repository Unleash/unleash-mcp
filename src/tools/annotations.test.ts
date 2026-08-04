import { describe, expect, it } from 'vitest';
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

const tools = [
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
] as ToolDefinition[];

// The Connectors Directory requires every tool to declare a title and the
// applicable readOnlyHint/destructiveHint. This guards that contract so a new
// tool can't ship without annotations.
describe('tool annotations', () => {
  it.each(
    tools.map((tool) => [tool.name, tool] as const),
  )('%s declares a title and read/write hints', (_name, tool) => {
    expect(tool.title.length).toBeGreaterThan(0);
    expect(typeof tool.annotations.readOnlyHint).toBe('boolean');
    // destructiveHint is only meaningful for write tools; require it there.
    if (tool.annotations.readOnlyHint === false) {
      expect(typeof tool.annotations.destructiveHint).toBe('boolean');
    }
  });

  it('classifies writes and reads as expected', () => {
    const readOnly = tools
      .filter((t) => t.annotations.readOnlyHint === true)
      .map((t) => t.name)
      .sort();
    const destructive = tools
      .filter((t) => t.annotations.destructiveHint === true)
      .map((t) => t.name)
      .sort();

    expect(readOnly).toEqual(
      [
        'cleanup_flag',
        'detect_flag',
        'evaluate_change',
        'get_flag_state',
        'list_flags',
        'list_projects',
        'wrap_change',
      ].sort(),
    );
    expect(destructive).toEqual(['remove_flag_strategy']);
  });
});
