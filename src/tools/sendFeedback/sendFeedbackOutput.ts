import { z } from 'zod';
import { failed, type Failed } from '../shared/failed.ts';

const sent = z.object({ kind: z.literal('sent') });

const result = z.discriminatedUnion('kind', [sent, failed]);

/** Output schema of `send_feedback`: the report was sent, or Unleash refused it. */
export const sendFeedbackOutput = { result };

export type Sent = z.infer<typeof sent>;
export type SendFeedbackResult = Sent | Failed;
