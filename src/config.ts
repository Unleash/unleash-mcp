import { z } from 'zod';

// An env file line such as `UNLEASH_FEEDBACK_URL=` sets an empty string, which means unset.
const blankAsUnset = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

const configSchema = z.object({
  UNLEASH_BASE_URL: z.url(),
  UNLEASH_PAT: z.string().min(1),
  UNLEASH_SNAPSHOT_MODE: z.enum(['record', 'playback']).default('playback'),
  // The user's opt-in to sending anonymous feedback to Unleash. Off unless set.
  UNLEASH_MCP_SEND_FEEDBACK: z.stringbool().default(false),
  // The Unleash instance that receives feedback. No default: without it, send_feedback fails.
  UNLEASH_FEEDBACK_URL: z.preprocess(blankAsUnset, z.url({ protocol: /^https?$/ }).optional()),
});

export type Config = z.infer<typeof configSchema>;

export const readConfig = (env: Record<string, string | undefined>): Config => configSchema.parse(env);
