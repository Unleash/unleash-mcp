import { z } from 'zod';
import { type Failed, failed } from '../shared/failed.ts';

const target = {
  action: z.enum(['create', 'complete']),
  project: z.string(),
  flag: z.string(),
};

const applied = z.object({ kind: z.literal('applied'), ...target });

const failedOperation = z.object({
  kind: z.literal('failed'),
  ...target,
  error: failed.omit({ kind: true }).describe('What Unleash answered; the operation was not applied'),
});

const result = z.discriminatedUnion('kind', [applied, failedOperation]);

export const flagLifecycleOutput = {
  results: z.array(result).describe('One per operation, in the order given, each naming the operation it answers'),
};

/** What the flag lifecycle tool answers. */
export type FlagLifecycleOutput = z.infer<z.ZodObject<typeof flagLifecycleOutput>>;
/** The answer to one operation: the operation it answers, and whether it was applied. */
export type FlagLifecycleResult = z.infer<typeof result>;
/** What a step answers. The tool adds the operation it answers. */
export type Outcome = { kind: 'applied' } | Failed;
