import { z } from 'zod';

const configSchema = z.object({
  UNLEASH_BASE_URL: z.url(),
  UNLEASH_PAT: z.string().min(1),
  UNLEASH_SNAPSHOT_MODE: z.enum(['record', 'playback']).default('playback'),
  // The user's opt-in to sending anonymous feedback to Unleash. Off unless set.
  UNLEASH_MCP_SEND_FEEDBACK: z.stringbool().default(false),
});

export type Config = z.infer<typeof configSchema>;

export const readConfig = (env: Record<string, string | undefined>): Config => configSchema.parse(env);
