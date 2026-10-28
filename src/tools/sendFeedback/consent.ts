import type { ConsentStore, Decision } from './consentStore.ts';

/** Asks the user, showing `message`. No answer when the client can't ask, or the user dismisses the question or leaves it unanswered. */
export type AskUser = (message: string) => Promise<Decision | undefined>;

/** Whether the user agreed to send reports to Unleash, given the client the agent runs in, as it named itself, and how to ask its user. */
export type Consent = (client: { name?: string; ask: AskUser }) => Promise<Decision>;

/** The consent of a user who granted it through the environment, or whose host decided for them. */
export const granted: Consent = async () => 'granted';

// Clients that never show the user a form, as v1 found them: OpenCode accepts it on its own, Gemini and Antigravity cancel it.
// A grant stored while running in one of them may not have come from the user either, so the file is left unread.
const clientsHidingForms = [/opencode/i, /^cli$/i, /gemini/i, /antigravity/i];

/**
 * Creates the consent of a user who hasn't decided through the environment: the decision in `store`, else the user's answer,
 * asked once per session and stored. A question left unanswered denies for this session only, so the user is asked again next time.
 */
export const createConsent = (store: ConsentStore): Consent => {
  // Shared by calls made while the user is still answering, so they're asked once.
  let decision: Promise<Decision> | undefined;
  return async ({ name, ask }) => {
    if (!name || clientsHidingForms.some((client) => client.test(name))) return 'denied';
    decision ??= decide(store, ask);
    return decision;
  };
};

const decide = async (store: ConsentStore, ask: AskUser): Promise<Decision> => {
  const stored = await store.read();
  if (stored) return stored;
  const answer = await ask(questionFor(store.location)).catch(() => undefined);
  if (!answer) return 'denied';
  await store.write(answer);
  return answer;
};

const questionFor = (location: string): string =>
  [
    'Send anonymous reports to Unleash to help improve this MCP?',
    'Reports never include flag names, project IDs, code, URLs, or tokens.',
    `Your choice takes effect immediately and is stored in ${location} for future sessions.`,
  ].join('\n');
