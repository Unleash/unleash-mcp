import { z } from 'zod';
import { failed } from './failed.ts';

const flagNaming = z.object({
  pattern: z.string().describe('JavaScript regular expression new flag names must match'),
  example: z.string().optional(),
  description: z.string().optional(),
});

const project = z.object({
  kind: z.literal('project'),
  environments: z.array(z.string()).describe('Names release accepts as environment'),
  flagNaming: flagNaming.optional().describe('Set when the project enforces a naming pattern on new flags'),
});

const result = z.discriminatedUnion('kind', [project, failed]);

export const inspectOutput = {
  results: z.array(result).describe('One per query, in the order asked'),
};

export type InspectOutput = z.infer<z.ZodObject<typeof inspectOutput>>;
export type InspectResult = z.infer<typeof result>;
export type Project = z.infer<typeof project>;
