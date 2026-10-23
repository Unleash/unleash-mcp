import { z } from 'zod';
import { legalValue } from '../shared/legalValue.ts';

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
  name: z.string(),
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
  value: z.string(),
}).describe('Remove a legal value from a context field. Succeeds when the value is not there. Constraints that use it keep it');

const change = z.union([createContextField, updateContextField, deleteContextField, createLegalValue, deleteLegalValue]);

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
