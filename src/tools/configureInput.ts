import { z } from 'zod';

const legalValue = z.object({
  value: z.string().describe('e.g. gold'),
  description: z.string().optional().describe('What the value means, shown next to it when picking values'),
});

const createContextField = z.object({
  kind: z.literal('context_field'),
  action: z.literal('create'),
  name: z.string().describe('Name constraints refer to, e.g. tier'),
  description: z.string().optional().describe('What the field holds, shown to people choosing it for a constraint'),
  stickiness: z.boolean().optional().describe('Lets flags use the field for custom stickiness'),
  legalValues: z.array(legalValue).optional().describe('When set, constraints on the field may only use these values'),
}).describe('Create a global context field');

const deleteContextField = z.object({
  kind: z.literal('context_field'),
  action: z.literal('delete'),
  name: z.string(),
}).describe('Delete a global context field. Unleash refuses while a flag has a constraint on it');

const change = z.union([createContextField, deleteContextField]);

export const configureInput = {
  changes: z.array(change).min(1).describe('Applied in the order given; one result per change'),
};

/** What the configure tool receives. */
export type ConfigureInput = z.infer<z.ZodObject<typeof configureInput>>;
/** One change to an Unleash resource, tagged by `kind` and `action`. */
export type Change = z.infer<typeof change>;
/** The change that creates a global context field. */
export type CreateContextField = z.infer<typeof createContextField>;
/** The change that deletes a global context field. */
export type DeleteContextField = z.infer<typeof deleteContextField>;
