import { z } from 'zod';
import { type Failed, failed } from '../shared/failed.ts';

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

const releaseTemplate = {
  resource: z.literal('release_template'),
  action: z.enum(['create']),
  name: z.string(),
};

// A segment has no id until it is created, so the target differs by action.
const createdSegment = {
  resource: z.literal('segment'),
  action: z.literal('create'),
  name: z.string(),
};

const updatedSegment = {
  resource: z.literal('segment'),
  action: z.literal('update'),
  id: z.number().int(),
  name: z.string(),
};

const segment = z.discriminatedUnion('action', [z.object(createdSegment), z.object(updatedSegment)]);

const target = z.discriminatedUnion('resource', [z.object(contextField), z.object(legalValue), z.object(releaseTemplate), segment]);

const error = failed.omit({ kind: true }).describe('What Unleash answered; the change was not applied');

const applied = z.discriminatedUnion('resource', [
  z.object({ kind: z.literal('applied'), ...contextField }),
  z.object({ kind: z.literal('applied'), ...legalValue }),
  z.object({ kind: z.literal('applied'), ...releaseTemplate, id: z.string().describe('Release template id') }),
  z.discriminatedUnion('action', [
    z.object({ kind: z.literal('applied'), ...createdSegment, id: z.number().int().describe('Segment id, as release targets take it') }),
    z.object({ kind: z.literal('applied'), ...updatedSegment }),
  ]),
]);

const failedChange = z.discriminatedUnion('resource', [
  z.object({ kind: z.literal('failed'), ...contextField, error }),
  z.object({ kind: z.literal('failed'), ...legalValue, error }),
  z.object({ kind: z.literal('failed'), ...releaseTemplate, error }),
  z.discriminatedUnion('action', [
    z.object({ kind: z.literal('failed'), ...createdSegment, error }),
    z.object({ kind: z.literal('failed'), ...updatedSegment, error }),
  ]),
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
/** What a step answers, with the id Unleash gave a created resource that has one. The tool adds the change it answers. */
export type Outcome = { kind: 'applied'; id?: string | number } | Failed;
