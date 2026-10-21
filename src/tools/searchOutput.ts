import { z } from 'zod';
import { failed } from './failed.ts';

const project = z.object({
  kind: z.literal('project'),
  environments: z.array(z.string()).describe('Names release accepts as environment'),
});

const result = z.discriminatedUnion('kind', [project, failed]);

export const searchOutput = {
  results: z.array(result).describe('One per query, in the order asked'),
};

export type SearchOutput = z.infer<z.ZodObject<typeof searchOutput>>;
export type SearchResult = z.infer<typeof result>;
