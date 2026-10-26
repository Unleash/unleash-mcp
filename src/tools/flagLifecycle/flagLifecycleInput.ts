import { z } from 'zod';
import { flagType } from '../shared/flagType.ts';
import { tag } from '../shared/tag.ts';
import { link } from '../shared/link.ts';

const define = z.object({
  action: z.literal('define'),
  project: z.string().describe('Project id, as a projects search returns it'),
  flag: z.string().describe('Name, unique across projects, e.g. new-checkout'),
  type: flagType.optional().describe('What the flag is for; a new flag is release when left out. Permanent kinds (kill-switch, permission) never count as stale'),
  description: z.string().optional().describe('What the flag controls, shown to people'),
  tags: z.array(tag).optional().describe('Exactly the tags the flag has, by type and value as flag rows show them. The type must exist; a value that does not exist yet is created, so check a tags search first when it should match an existing one. An empty list removes them all'),
  links: z.array(link).optional().describe('Exactly the related URLs the flag has, such as the pull request or the ticket, matched by URL: a changed title is not applied. An empty list removes them all'),
}).describe('Make sure the flag exists as listed: creates it, off in every environment, or changes an existing one to match. What is listed is what the flag ends up with; what is left out is left alone. Release turns a flag on');

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

const archive = z.object({
  action: z.literal('archive'),
  project: z.string().describe('Project id, as a flags search returns it'),
  flag: z.string().describe('Flag name, as a flags search returns it'),
}).describe('Archive a flag: SDKs stop getting it and treat it as off. In a project whose changes need approval, it goes into a change request');

const revive = z.object({
  action: z.literal('revive'),
  project: z.string().describe('Project id, as a flags search returns it'),
  flag: z.string().describe('Flag name, as a flags search with the archived stage returns it'),
}).describe('Bring an archived flag back, off in every environment; links to parent flags removed by archiving stay removed. Unleash answers success for a flag that is missing or not archived and leaves it as it is');

const remove = z.object({
  action: z.literal('delete'),
  project: z.string().describe('Project id, as a flags search returns it'),
  flag: z.string().describe('Flag name, as a flags search with the archived stage returns it'),
}).describe('Delete an archived flag permanently; it cannot be revived. Ask the user first. Unleash answers success for a flag that is missing or not archived and leaves it as it is');

const operation = z.discriminatedUnion('action', [define, complete, archive, revive, remove]);

export const flagLifecycleInput = {
  operations: z.array(operation).min(1).describe('Applied in the order given; one result per operation'),
};

/** What the flag lifecycle tool receives. */
export type FlagLifecycleInput = z.infer<z.ZodObject<typeof flagLifecycleInput>>;
/** One operation on a flag's lifecycle, tagged by `action`. */
export type Operation = z.infer<typeof operation>;
/** The operation that creates a flag or brings an existing one to have what is listed. */
export type Define = z.infer<typeof define>;
/** The operation that marks a flag completed. */
export type Complete = z.infer<typeof complete>;
/** The operation that archives a flag. */
export type Archive = z.infer<typeof archive>;
/** The operation that brings an archived flag back. */
export type Revive = z.infer<typeof revive>;
/** The operation that deletes an archived flag for good. */
export type Delete = z.infer<typeof remove>;
