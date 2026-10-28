import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { AskUser } from './consent.ts';

// The agent waits on the answer, so an ignored question gives up, as in v1.
const timeoutMs = 60_000;

/** Asks the user of the client connected to `server` through an MCP elicitation form with no fields: accepting grants, declining denies. */
export const createAskUser =
  (server: Server): AskUser =>
  async (message) => {
    if (!server.getClientCapabilities()?.elicitation?.form) return undefined;
    const { action } = await server.elicitInput(
      { mode: 'form', message, requestedSchema: { type: 'object', properties: {} } },
      { timeout: timeoutMs },
    );
    return action === 'accept' ? 'granted' : action === 'decline' ? 'denied' : undefined;
  };
