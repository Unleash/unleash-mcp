import { z } from 'zod';

export const failed = z.object({
  kind: z.literal('failed'),
  status: z.number().describe('HTTP status from Unleash, 0 when Unleash could not be reached'),
  name: z.string().describe('Unleash error type, e.g. NotFoundError, PermissionError'),
  reasons: z.array(z.string()).describe('What Unleash said'),
});

export type Failed = z.infer<typeof failed>;

// Unleash puts the useful error messages in `details`, which the OpenAPI spec omits.
type UnleashError = { name?: string; details?: { message: string }[] };
// openapi-fetch leaves `error` unset when an error reply has no body, so `response.ok` is the failure check.
export type FailedCall = { response: Response; error?: UnleashError };

export const toFailed = ({ response, error }: FailedCall): Failed => ({
  kind: 'failed',
  status: response.status,
  name: error?.name ?? 'UnknownError',
  reasons: error?.details?.map((d) => d.message) ?? [],
});

/** How long a call outside the Unleash client waits for a reply, so a hanging connection doesn't block the agent. */
export const timeoutMs = 10_000;

/**
 * Maps a rejected `fetch` to `Failed`. fetch rejects only when no reply came: no connection (a TypeError whose cause
 * says why) or the timeout fired. No reply means no HTTP status, hence 0.
 */
export const toUnreachable = (error: Error): Failed => {
  const cause = error.cause instanceof Error ? [error.cause.message] : [];
  return { kind: 'failed', status: 0, name: 'NetworkError', reasons: [error.message, ...cause] };
};
