import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from '../context.js';
import type { FeedbackConsentDecision } from './consentDecision.js';

export type AskUser = () => Promise<FeedbackConsentDecision | undefined>;

export const CONSENT_PROMPT_TIMEOUT_MS = 60_000;

export function buildConsentPromptMessage(consentFileLocation: string): string {
  return [
    'Send anonymous reports to Unleash to help improve this MCP?',
    'Reports never include Never flag names, project IDs, code, URLs, or tokens.',
    `Your choice takes effect immediately and is stored in ${consentFileLocation} for future sessions.`,
  ].join('\n');
}

export function createElicitationConsentPrompt(
  server: McpServer,
  consentFileLocation: string,
  logger: Logger,
): AskUser {
  return async (): Promise<FeedbackConsentDecision | undefined> => {
    if (!server.server.getClientCapabilities()?.elicitation?.form) {
      logger.info('Client does not support elicitation; feedback consent cannot be requested');
      return undefined;
    }

    const result = await server.server.elicitInput(
      {
        mode: 'form',
        message: buildConsentPromptMessage(consentFileLocation),
        requestedSchema: { type: 'object', properties: {} },
      },
      { timeout: CONSENT_PROMPT_TIMEOUT_MS },
    );

    switch (result.action) {
      case 'accept':
        return 'granted';
      case 'decline':
        return 'denied';
      case 'cancel':
        return undefined;
    }
  };
}
