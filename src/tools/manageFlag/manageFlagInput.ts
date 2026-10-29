import { z } from 'zod';
import { flagType } from '../shared/flagType.ts';
import { link } from '../shared/link.ts';
import { parent } from '../shared/parent.ts';
import { tag } from '../shared/tag.ts';

const define = z
  .strictObject({
    action: z.literal('define'),
    project: z.string().describe('Project id, as a projects search returns it'),
    flag: z.string().describe('Name, unique across projects, e.g. new-checkout'),
    type: flagType
      .optional()
      .describe(
        'What the flag is for; a new flag is release when left out. Permanent kinds (kill-switch, permission) never count as stale',
      ),
    description: z.string().optional().describe('What the flag controls, shown to people'),
    tags: z
      .array(tag)
      .optional()
      .describe(
        'Exactly the tags the flag has, by type and value as flag rows show them. The type must exist; a value that does not exist yet is created, so check a tags search first when it should match an existing one. An empty list removes them all',
      ),
    links: z
      .array(link.extend({ url: z.url({ protocol: /^https?$/ }) }))
      .optional()
      .describe(
        'Exactly the related URLs the flag has, such as the pull request or the ticket, matched by URL: a changed title is not applied. An empty list removes them all',
      ),
  })
  .describe(
    'Make sure the flag exists as listed: creates it, off in every environment, or changes an existing one to match. What is listed is what the flag ends up with; what is left out is left alone. Release turns a flag on',
  );

const kept = z
  .strictObject({
    kind: z.literal('kept'),
    value: z
      .string()
      .min(1)
      .optional()
      .describe(
        'The flag value that was kept, when the feature was tried with several: a value name as inspect lists them under the environment or milestone targets. Unleash records it unchecked; leave out when the flag has one value',
      ),
  })
  .describe('The feature stays and the flag can go from the code');

const discarded = z.strictObject({ kind: z.literal('discarded') }).describe('The feature was dropped');

const complete = z
  .strictObject({
    action: z.literal('complete'),
    project: z.string().describe('Project id, as a flags search returns it'),
    flag: z.string().describe('Flag name, as a flags search returns it'),
    outcome: z.discriminatedUnion('kind', [kept, discarded]).describe('How the rollout ended'),
  })
  .describe(
    'Mark a flag completed: its rollout is over and the code is ready for cleanup. Only a note for people; SDKs are not affected',
  );

const archive = z
  .strictObject({
    action: z.literal('archive'),
    project: z.string().describe('Project id, as a flags search returns it'),
    flag: z.string().describe('Flag name, as a flags search returns it'),
  })
  .describe(
    'Archive a flag: SDKs stop getting it and treat it as off. In a project whose changes need approval, it goes into a change request',
  );

const revive = z
  .strictObject({
    action: z.literal('revive'),
    project: z.string().describe('Project id, as a flags search returns it'),
    flag: z.string().describe('Flag name, as a flags search with the archived stage returns it'),
  })
  .describe(
    'Bring an archived flag back, off in every environment; links to parent flags removed by archiving stay removed. Unleash answers success for a flag that is missing or not archived and leaves it as it is',
  );

// Not offered for now: deleting can't be undone, while an archived flag can be revived. Kept for when it is.
const remove = z
  .strictObject({
    action: z.literal('delete'),
    project: z.string().describe('Project id, as a flags search returns it'),
    flag: z.string().describe('Flag name, as a flags search with the archived stage returns it'),
  })
  .describe(
    'Delete an archived flag permanently; it cannot be revived. Ask the user first. Unleash answers success for a flag that is missing or not archived and leaves it as it is',
  );

const noParent = z.strictObject({ kind: z.literal('none') }).describe('The flag stops depending on another');

const setParentDependency = z
  .strictObject({
    action: z.literal('set_parent_dependency'),
    project: z.string().describe('Project id, as a flags search returns it'),
    flag: z.string().describe('Flag name, as a flags search returns it'),
    parent: z
      .discriminatedUnion('kind', [...parent.options, noParent])
      .describe(
        'The parent, as a flags search returns it, in the same project, and how it must be; an inspect of a flag returns its parent in this shape. Inspect both flags first: the parent must have no parent and this flag no children',
      ),
  })
  .describe(
    'Make a flag depend on a parent flag in every environment, or stop it depending on one. A flag has at most one parent; setting one replaces the old. In a project whose changes need approval, it goes into a change request',
  );

const operation = z.discriminatedUnion('action', [define, complete, archive, revive, setParentDependency]);

export const manageFlagInput = z.strictObject({
  operations: z.array(operation).min(1).describe('Applied in the order given; one result per operation'),
});

export type ManageFlagInput = z.infer<typeof manageFlagInput>;
export type Operation = z.infer<typeof operation>;
export type Define = z.infer<typeof define>;
export type Complete = z.infer<typeof complete>;
export type Archive = z.infer<typeof archive>;
export type Revive = z.infer<typeof revive>;
export type Delete = z.infer<typeof remove>;
export type SetParentDependency = z.infer<typeof setParentDependency>;
