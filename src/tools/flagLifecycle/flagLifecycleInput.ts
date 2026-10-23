import { z } from 'zod';

const kept = z.object({
  kind: z.literal('kept'),
  value: z.string().min(1).optional().describe('The flag value that was kept, when the feature was tried with several: a value name as inspect lists them under the environment or milestone targets. Unleash records it unchecked; leave out when the flag has one value'),
}).describe('The feature stays and the flag can go from the code');

const discarded = z.object({ kind: z.literal('discarded') }).describe('The feature was dropped');

const complete = z.object({
  action: z.literal('complete'),
  project: z.string().describe('Project id, as a flags search returns it'),
  flag: z.string().describe('Flag name, as a flags search returns it'),
  outcome: z.discriminatedUnion('kind', [kept, discarded]).describe('How the rollout ended'),
}).describe('Mark a flag completed: its rollout is over and the code is ready for cleanup. Only a note for people; SDKs are not affected');

const operation = z.discriminatedUnion('action', [complete]);

export const flagLifecycleInput = {
  operations: z.array(operation).min(1).describe('Applied in the order given; one result per operation'),
};

/** What the flag lifecycle tool receives. */
export type FlagLifecycleInput = z.infer<z.ZodObject<typeof flagLifecycleInput>>;
/** One operation on a flag's lifecycle, tagged by `action`. */
export type Operation = z.infer<typeof operation>;
/** The operation that marks a flag completed. */
export type Complete = z.infer<typeof complete>;
