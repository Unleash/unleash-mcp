import { z } from 'zod';
import { flagType } from '../shared/flagType.ts';
import { tag } from '../shared/tag.ts';

const create = z.object({
  action: z.literal('create'),
  project: z.string().describe('Project id, as a projects search returns it'),
  flag: z.string().describe('Name, unique across projects, e.g. new-checkout'),
  type: flagType.optional().describe('What the flag is for; release when left out. Permanent kinds (kill-switch, permission) never count as stale'),
  description: z.string().optional().describe('What the flag controls, shown to people'),
  tags: z.array(tag).optional().describe('Tags to put on the flag, by type and value as flag rows show them; the type must exist'),
}).describe('Create a flag, off in every environment; release turns it on');

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

const operation = z.discriminatedUnion('action', [create, complete]);

export const flagLifecycleInput = {
  operations: z.array(operation).min(1).describe('Applied in the order given; one result per operation'),
};

/** What the flag lifecycle tool receives. */
export type FlagLifecycleInput = z.infer<z.ZodObject<typeof flagLifecycleInput>>;
/** One operation on a flag's lifecycle, tagged by `action`. */
export type Operation = z.infer<typeof operation>;
/** The operation that creates a flag. */
export type Create = z.infer<typeof create>;
/** The operation that marks a flag completed. */
export type Complete = z.infer<typeof complete>;
