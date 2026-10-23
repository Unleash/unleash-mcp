import { z } from 'zod';
import { legalValue } from '../shared/legalValue.ts';
import { target } from '../shared/target.ts';

const project = z.string().optional().describe('Project id of a project field, as a projects search returns it; leave out for a global field');

const contextField = {
  kind: z.literal('context_field'),
  project,
  name: z.string().describe('Name constraints refer to, e.g. tier'),
  description: z.string().optional().describe('What the field holds, shown to people choosing it for a constraint'),
  stickiness: z.boolean().optional().describe('Lets flags use the field for custom stickiness'),
  legalValues: z.array(legalValue).optional().describe('When set, constraints on the field may only use these values'),
};

const createContextField = z.object({ ...contextField, action: z.literal('create') })
  .describe('Create a context field. A project field is only for flags in that project; names are unique across projects');

const updateContextField = z.object({ ...contextField, action: z.literal('update') })
  .describe('Replace a context field. Whatever is left out is reset: no description, no stickiness, no legal values');

const deleteContextField = z.object({
  kind: z.literal('context_field'),
  action: z.literal('delete'),
  project,
  name: z.string().describe('Name of the context field to delete'),
}).describe('Delete a context field. Unleash refuses while a flag has a constraint on it');

const createLegalValue = z.object({
  kind: z.literal('legal_value'),
  action: z.literal('create'),
  project,
  field: z.string().describe('Name of the context field the value belongs to, as a context fields search returns it'),
  ...legalValue.shape,
}).describe('Add a legal value to a context field. If the value exists, it gets the new description');

const deleteLegalValue = z.object({
  kind: z.literal('legal_value'),
  action: z.literal('delete'),
  project,
  field: z.string().describe('Name of the context field the value belongs to, as a context fields search returns it'),
  value: z.string().describe('The value to remove, e.g. gold'),
}).describe('Remove a legal value from a context field. Succeeds when the value is not there. Constraints that use it keep it');

const tagType = {
  kind: z.literal('tag_type'),
  name: z.string().describe('URL friendly, 2 to 50 characters, e.g. team'),
  description: z.string().optional().describe('What the tags of this type say about a flag'),
};

const createTagType = z.object({ ...tagType, action: z.literal('create') })
  .describe('Create a tag type: what a tag on a flag belongs to, such as team or stage. Tagging a flag then creates the tags themselves');

const updateTagType = z.object({ ...tagType, action: z.literal('update') })
  .describe('Replace a tag type\'s description; left out, it is cleared');

const deleteTagType = z.object({
  kind: z.literal('tag_type'),
  action: z.literal('delete'),
  name: z.string().describe('Name of the tag type to delete, as a tag types search returns it'),
}).describe('Delete a tag type and its tags, taking them off every flag. A tag types search shows how many tags and projects that touches: check and ask before');

const deleteTag = z.object({
  kind: z.literal('tag'),
  action: z.literal('delete'),
  type: z.string().describe('Tag type, as a tags search returns it'),
  value: z.string().describe('Tag value, as a tags search returns it'),
}).describe('Delete a tag, taking it off every flag that has it. A flags search by tag shows which: check and ask before');

const advance = z.union([
  z.object({ afterMinutes: z.number().int().min(1).describe('Minutes since the milestone started') }),
  z.object({ afterExposures: z.number().int().min(1).describe('Times the flag was evaluated as enabled') }),
]).describe('Moves the flag to the next milestone on its own once met');

const milestone = z.object({
  name: z.string().describe('e.g. Internal, 50%, Everyone'),
  targets: z.array(target).min(1).describe('The audiences that get the feature while the milestone is active, OR-ed'),
  advance: advance.optional(),
}).describe('One step of the rollout');

const createReleaseTemplate = z.object({
  kind: z.literal('release_template'),
  action: z.literal('create'),
  project: z.string().optional().describe('Project id of a project template; leave out for a template every project can use'),
  name: z.string().describe('Unique, e.g. Gradual rollout'),
  description: z.string().optional().describe('What the template is for, shown when picking one for a flag'),
  milestones: z.array(milestone).min(1).describe('In release order. Starting a milestone replaces the audiences of the one before'),
}).describe('Create a release template: a reusable rollout plan for flags, made of milestones');

const change = z.union([createContextField, updateContextField, deleteContextField, createLegalValue, deleteLegalValue, createTagType, updateTagType, deleteTagType, deleteTag, createReleaseTemplate]);

export const configureInput = {
  changes: z.array(change).min(1).describe('Applied in the order given; one result per change'),
};

/** What the configure tool receives. */
export type ConfigureInput = z.infer<z.ZodObject<typeof configureInput>>;
/** One change to an Unleash resource, tagged by `kind` and `action`. */
export type Change = z.infer<typeof change>;
/** The change that creates a context field, global or in a project. */
export type CreateContextField = z.infer<typeof createContextField>;
/** The change that replaces a context field. */
export type UpdateContextField = z.infer<typeof updateContextField>;
/** The change that deletes a context field. */
export type DeleteContextField = z.infer<typeof deleteContextField>;
/** The change that adds a legal value to a context field, or redescribes an existing one. */
export type CreateLegalValue = z.infer<typeof createLegalValue>;
/** The change that removes a legal value from a context field. */
export type DeleteLegalValue = z.infer<typeof deleteLegalValue>;
/** The change that creates a tag type. */
export type CreateTagType = z.infer<typeof createTagType>;
/** The change that replaces a tag type's description. */
export type UpdateTagType = z.infer<typeof updateTagType>;
/** The change that deletes a tag type. */
export type DeleteTagType = z.infer<typeof deleteTagType>;
/** The change that deletes a tag. */
export type DeleteTag = z.infer<typeof deleteTag>;
/** The change that creates a release template, global or in a project. */
export type CreateReleaseTemplate = z.infer<typeof createReleaseTemplate>;
