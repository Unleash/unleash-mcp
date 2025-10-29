import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Resource } from '@modelcontextprotocol/sdk/types.js';

const WORKSPACE_SUMMARY_URI = 'unleash://workspace/summary';

export const workspaceSummaryResource: Resource = {
  uri: WORKSPACE_SUMMARY_URI,
  name: 'Workspace Summary',
  description: 'Snapshot of local repository signals (package manager, scripts, TypeScript usage) for quick reference.',
  mimeType: 'text/markdown',
};

export async function buildWorkspaceSummaryDocument(): Promise<string> {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  let packageManager = 'unknown';
  let scripts: Record<string, string> = {};
  let usesTypeScript = false;

  try {
    const raw = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(raw) as {
      packageManager?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    if (pkg.packageManager) {
      packageManager = pkg.packageManager;
    }
    scripts = pkg.scripts ?? {};
    usesTypeScript = Boolean(
      (pkg.dependencies && pkg.dependencies.typescript) ||
        (pkg.devDependencies && pkg.devDependencies.typescript)
    );
  } catch (error) {
    // No package.json or unreadable file; keep defaults
  }

  const primaryScripts = ['format', 'lint', 'test', 'build'];
  const scriptLines = primaryScripts
    .filter(name => Boolean(scripts[name]))
    .map(name => `- **${name}**: ${scripts[name]}`);

  const lines: string[] = [
    '# Workspace Summary',
    '',
    `Package manager: ${packageManager}`,
    `TypeScript: ${usesTypeScript ? 'yes' : 'no'}`,
    '',
    scriptLines.length > 0 ? '## Key npm scripts' : '## Key npm scripts',
    scriptLines.length > 0 ? scriptLines.join('\n') : '- (none detected)',
    '',
    'Keep changes small and run formatter/linter/tests before completion.',
  ];

  return lines.join('\n');
}

export function isWorkspaceSummaryUri(uri: string): boolean {
  return uri === WORKSPACE_SUMMARY_URI;
}
