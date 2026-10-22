import { z } from 'zod';
import { failed } from '../shared/failed.ts';

const segment = z.object({
  id: z.number().int(),
  name: z.string(),
  project: z.string().optional().describe('Set on a project segment; absent on a global one'),
});

const segments = z.object({
  kind: z.literal('segments'),
  segments: z.array(segment),
});

const result = z.discriminatedUnion('kind', [segments, failed]);

export const searchOutput = {
  results: z.array(result).describe('One per query, in the order asked'),
};

export type SearchOutput = z.infer<z.ZodObject<typeof searchOutput>>;
export type SearchResult = z.infer<typeof result>;
export type Segments = z.infer<typeof segments>;
