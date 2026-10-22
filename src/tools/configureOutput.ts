import { z } from 'zod';
import { failed } from './failed.ts';

const created = z.object({
  kind: z.literal('created'),
  resource: z.literal('context_field'),
  name: z.string(),
});

const result = z.discriminatedUnion('kind', [created, failed]);

export const configureOutput = {
  results: z.array(result).describe('One per change, in the order given'),
};

export type ConfigureOutput = z.infer<z.ZodObject<typeof configureOutput>>;
export type ConfigureResult = z.infer<typeof result>;
