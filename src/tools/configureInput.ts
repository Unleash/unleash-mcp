import { z } from 'zod';

const createContextField = z.object({
  kind: z.literal('context_field'),
  action: z.literal('create'),
  name: z.string().describe('Name constraints refer to, e.g. tier'),
  description: z.string().optional().describe('What the field holds, shown to people choosing it for a constraint'),
}).describe('Create a global context field');

const change = z.discriminatedUnion('kind', [createContextField]);

export const configureInput = {
  changes: z.array(change).min(1).describe('Applied in the order given; one result per change'),
};

export type ConfigureInput = z.infer<z.ZodObject<typeof configureInput>>;
export type Change = z.infer<typeof change>;
export type CreateContextField = z.infer<typeof createContextField>;
