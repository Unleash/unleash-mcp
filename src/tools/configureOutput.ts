import { z } from 'zod';
import { failed } from './failed.ts';

const created = z.discriminatedUnion('resource', [
  z.object({ kind: z.literal('created'), resource: z.literal('context_field'), name: z.string() }),
  z.object({ kind: z.literal('created'), resource: z.literal('legal_value'), field: z.string(), value: z.string() }),
]);

const updated = z.object({
  kind: z.literal('updated'),
  resource: z.literal('context_field'),
  name: z.string(),
});

const deleted = z.object({
  kind: z.literal('deleted'),
  resource: z.literal('context_field'),
  name: z.string(),
});

const result = z.discriminatedUnion('kind', [created, updated, deleted, failed]);

export const configureOutput = {
  results: z.array(result).describe('One per change, in the order given'),
};

export type ConfigureOutput = z.infer<z.ZodObject<typeof configureOutput>>;
export type ConfigureResult = z.infer<typeof result>;
