import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerContext, handleToolError } from '../context.js';

const runChecksSchema = z
  .object({})
  .describe('No parameters needed. Runs locally-defined check commands virtually and reports what should be run.');

function extractScripts(): Record<string, string> {
  const scripts: Record<string, string> = {};
  try {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const raw = readFileSync(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    Object.assign(scripts, pkg.scripts ?? {});
  } catch {
    // ignore
  }
  return scripts;
}

function selectCommands(allScripts: Record<string, string>): Record<string, string> {
  const candidates = ['format', 'lint', 'test', 'build', 'typecheck'];
  const result: Record<string, string> = {};
  for (const key of candidates) {
    if (allScripts[key]) {
      result[key] = allScripts[key];
    }
  }
  return result;
}

export async function runChecks(
  context: ServerContext,
  args: unknown
): Promise<CallToolResult> {
  try {
    runChecksSchema.parse(args ?? {});

    const scripts = extractScripts();
    const commands = selectCommands(scripts);

    const lines: string[] = [
      '# Local Check Summary (no-op)',
      '',
      'This MCP server does not execute commands directly. Run the following locally after applying your changes:',
      '',
    ];

    if (Object.keys(commands).length === 0) {
      lines.push('- No formatter/linter/test scripts detected. Run your project-specific checks manually.');
    } else {
      for (const [name, cmd] of Object.entries(commands)) {
        lines.push(`- **${name}**: ${cmd}`);
      }
    }

    const structuredContent = {
      success: true,
      executed: false,
      recommendations: commands,
      message:
        'Commands were not executed automatically. Run the listed formatter, linter, and test commands locally before finalizing the change.',
    };

    return {
      content: [
        {
          type: 'text',
          text: lines.join('\n'),
        },
      ],
      structuredContent,
    };
  } catch (error) {
    return handleToolError(context, error, 'run_checks');
  }
}

export const runChecksTool = {
  name: 'run_checks',
  description:
    'Summarize which formatter, linter, and test commands should run in this repository before finalizing a change.',
  annotations: {
    title: 'Run Checks Summary',
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {},
  },
};
