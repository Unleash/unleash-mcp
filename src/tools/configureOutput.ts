import { z } from 'zod';
import { type Failed, failed } from './failed.ts';

const contextField = {
  resource: z.literal('context_field'),
  action: z.enum(['create', 'update', 'delete']),
  name: z.string(),
};

const legalValue = {
  resource: z.literal('legal_value'),
  action: z.enum(['create', 'delete']),
  field: z.string(),
  value: z.string(),
};

const target = z.discriminatedUnion('resource', [z.object(contextField), z.object(legalValue)]);

const error = failed.omit({ kind: true }).describe('What Unleash answered; the change was not applied');

const applied = z.discriminatedUnion('resource', [
  z.object({ kind: z.literal('applied'), ...contextField }),
  z.object({ kind: z.literal('applied'), ...legalValue }),
]);

const failedChange = z.discriminatedUnion('resource', [
  z.object({ kind: z.literal('failed'), ...contextField, error }),
  z.object({ kind: z.literal('failed'), ...legalValue, error }),
]);

const result = z.discriminatedUnion('kind', [applied, failedChange]);

export const configureOutput = {
  results: z.array(result).describe('One per change, in the order given, each naming the change it answers'),
};

/** What the configure tool answers. */
export type ConfigureOutput = z.infer<z.ZodObject<typeof configureOutput>>;
/** The answer to one change: the change it answers, and whether it was applied. */
export type ConfigureResult = z.infer<typeof result>;
/** The change a result answers: its resource, action, and what it acted on. */
export type Target = z.infer<typeof target>;
/** What a step answers. The tool adds the change it answers. */
export type Outcome = { kind: 'applied' } | Failed;
