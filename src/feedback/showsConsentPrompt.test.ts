import { describe, expect, it } from 'vitest';
import { showsConsentPrompt } from './showsConsentPrompt.js';

describe('showsConsentPrompt', () => {
  it.each([
    'opencode',
    'OpenCode',
    'cli',
    'gemini-cli-mcp-client',
    'antigravity-client',
  ])('reports that %s does not show the consent prompt', (clientName) => {
    expect(showsConsentPrompt(clientName)).toBe(false);
  });

  it.each([
    'claude-code',
    'Visual Studio Code',
    'cursor-vscode',
    'codex-mcp-client',
    'kiro-cli',
  ])('reports that %s shows the consent prompt', (clientName) => {
    expect(showsConsentPrompt(clientName)).toBe(true);
  });

  it('reports that an unknown client does not show the consent prompt', () => {
    expect(showsConsentPrompt(undefined)).toBe(false);
  });
});
