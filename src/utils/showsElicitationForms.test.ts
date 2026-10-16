import { describe, expect, it } from 'vitest';
import { showsElicitationForms } from './showsElicitationForms.js';

describe('showsElicitationForms', () => {
  it.each([
    'opencode',
    'OpenCode',
    'cli',
    'gemini-cli-mcp-client',
    'antigravity-client',
  ])('reports that %s does not show elicitation forms', (clientName) => {
    expect(showsElicitationForms(clientName)).toBe(false);
  });

  it.each([
    'claude-code',
    'Visual Studio Code',
    'cursor-vscode',
    'codex-mcp-client',
    'kiro-cli',
  ])('reports that %s shows elicitation forms', (clientName) => {
    expect(showsElicitationForms(clientName)).toBe(true);
  });

  it('reports that an unknown client does not show elicitation forms', () => {
    expect(showsElicitationForms(undefined)).toBe(false);
  });
});
