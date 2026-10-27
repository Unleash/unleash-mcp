import { z } from 'zod';
import { type Failed, failed } from '../shared/failed.ts';

const sent = z.object({ kind: z.literal('sent') });

const disabled = z.object({ kind: z.literal('disabled') });

const result = z.discriminatedUnion('kind', [sent, disabled, failed]);

/** Output schema of `send_feedback`: the report was sent, the user didn't consent to sending it, or Unleash refused it. */
export const sendFeedbackOutput = { result };

export type Sent = z.infer<typeof sent>;
export type Disabled = z.infer<typeof disabled>;
export type SendFeedbackResult = Sent | Disabled | Failed;
