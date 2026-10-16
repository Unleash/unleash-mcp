import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from '../context.js';
import { describeError } from './errors.js';
import { showsElicitationForms } from './showsElicitationForms.js';

export interface Choice {
  key: string;
  title: string;
  options: Array<{ value: string; label: string }>;
}

/** Resolves to the picked value per choice key, or undefined when the user can't or won't answer. */
export type AskUserToChoose = (
  message: string,
  choices: Choice[],
) => Promise<Record<string, string> | undefined>;

export function createChoicePrompt(
  server: McpServer,
  getClientName: () => string | undefined,
  logger: Logger,
): AskUserToChoose {
  return async (message, choices) => {
    // Some clients declare elicitation but never show the form; asking them would only time out.
    if (
      !server.server.getClientCapabilities()?.elicitation?.form ||
      !showsElicitationForms(getClientName())
    ) {
      return undefined;
    }

    try {
      const result = await server.server.elicitInput({
        mode: 'form',
        message,
        requestedSchema: {
          type: 'object',
          properties: Object.fromEntries(
            choices.map((choice) => [
              choice.key,
              {
                type: 'string',
                title: choice.title,
                oneOf: choice.options.map(({ value, label }) => ({ const: value, title: label })),
              },
            ]),
          ),
          required: choices.map((choice) => choice.key),
        },
      });
      return result.action === 'accept' ? (result.content as Record<string, string>) : undefined;
    } catch (error) {
      logger.warn(`Choice prompt failed: ${describeError(error)}`);
      return undefined;
    }
  };
}
