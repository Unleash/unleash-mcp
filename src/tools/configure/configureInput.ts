import { z } from 'zod';
import { legalValue } from '../shared/legalValue.ts';
import { constraint, target } from '../shared/target.ts';

const project = z.string().optional().describe('Project id, as a projects search returns it; leave out for a global field');
const fieldProject = z.string().optional().describe('The field\'s project, as its context fields search row returns it; leave out when the row has none');
const fieldName = z.string().describe('Name of the field, as a context fields search returns it');

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

const updateContextField = z.object({
  ...contextField,
  action: z.literal('update'),
  project: fieldProject,
  name: fieldName,
  legalValues: contextField.legalValues.describe('When set, constraints on the field may only use these values. Replaces the current ones, which a context field inspect lists'),
}).describe('Replace a context field. Whatever is left out is reset: no description, no stickiness, no legal values. Inspect the field first and send back what to keep');

const deleteContextField = z.object({
  kind: z.literal('context_field'),
  action: z.literal('delete'),
  project: fieldProject,
  name: fieldName,
}).describe('Delete a context field. Unleash refuses while a flag has a constraint on it');

const createLegalValue = z.object({
  kind: z.literal('legal_value'),
  action: z.literal('create'),
  project: fieldProject,
  field: z.string().describe('Name of the context field the value belongs to, as a context fields search returns it'),
  ...legalValue.shape,
}).describe('Add a legal value to a context field. If the value exists, it gets the new description');

const deleteLegalValue = z.object({
  kind: z.literal('legal_value'),
  action: z.literal('delete'),
  project: fieldProject,
  field: z.string().describe('Name of the context field the value belongs to, as a context fields search returns it'),
  value: z.string().describe('The value to remove, as a context field inspect lists it'),
}).describe('Remove a legal value from a context field. Succeeds when the value is not there. Constraints that use it keep it');

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
  project: z.string().optional().describe('Project id, as a projects search returns it; leave out for a template every project can use'),
  name: z.string().describe('Unique, e.g. Gradual rollout'),
  description: z.string().optional().describe('What the template is for, shown when picking one for a flag'),
  milestones: z.array(milestone).min(1).describe('In release order. Starting a milestone replaces the audiences of the one before'),
}).describe('Create a release template: a reusable rollout plan for flags, made of milestones');

const segment = {
  kind: z.literal('segment'),
  project: z.string().optional().describe('Project id of a project segment, as a projects search returns it; leave out for a segment every project can use'),
  name: z.string().describe('Unique, e.g. Beta testers'),
  description: z.string().optional().describe('Who the segment is, shown when picking one for a target'),
  constraints: z.array(constraint).describe('All must match for a user to be in the segment'),
};

const createSegment = z.object({
  ...segment,
  action: z.literal('create'),
  constraints: segment.constraints.describe('All must match for a user to be in the segment. Empty matches everyone'),
})
  .describe('Create a segment: a reusable audience that release targets refer to by id');

const updateSegment = z.object({
  ...segment,
  action: z.literal('update'),
  id: z.number().int().describe('Id of the segment to replace, as a segments search returns it. Not a change request id'),
  project: z.string().optional().describe('The segment\'s project, as a segments search returns it, or another from a projects search to move it. Leaving it out makes the segment global'),
  constraints: segment.constraints.describe('All must match for a user to be in the segment. A segment inspect returns the current ones in this shape'),
}).describe('Replace a segment\'s name, constraints and project; a left out description stays. Inspect it first and send back what to keep. Every flag targeting it changes audience. In a project whose changes need approval, it goes into a change request');

const deleteSegment = z.object({
  kind: z.literal('segment'),
  action: z.literal('delete'),
  id: z.number().int().describe('Id of the segment to delete, as a segments search returns it. Not a change request id'),
  project: z.string().optional().describe('Project id of a project segment, as a segments search returns it; leave out for a global segment'),
}).describe('Delete a segment. Unleash refuses while a flag targets it; inspect the segment with usage to find those flags. In a project whose changes need approval, it goes into a change request');

const change = z.union([createContextField, updateContextField, deleteContextField, createLegalValue, deleteLegalValue, createReleaseTemplate, createSegment, updateSegment, deleteSegment]);

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
/** The change that creates a release template, global or in a project. */
export type CreateReleaseTemplate = z.infer<typeof createReleaseTemplate>;
/** The change that creates a segment, global or in a project. */
export type CreateSegment = z.infer<typeof createSegment>;
/** The change that replaces a segment, keeping its description when left out. */
export type UpdateSegment = z.infer<typeof updateSegment>;
/** The change that deletes a segment. */
export type DeleteSegment = z.infer<typeof deleteSegment>;
