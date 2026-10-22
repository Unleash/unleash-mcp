import { z } from 'zod';
import { failed } from '../shared/failed.ts';

const segment = z.object({
  id: z.number().int(),
  name: z.string(),
  project: z.string().optional().describe('Set on a project segment; absent on a global one'),
  createdAt: z.string().describe('ISO timestamp'),
  createdBy: z.string().optional().describe('Email of the user who created the segment'),
  usedInProjects: z.number().int(),
  usedInFlags: z.number().int(),
});

const segments = z.object({
  kind: z.literal('segments'),
  segments: z.array(segment).describe('Sorted by name'),
});

const result = z.discriminatedUnion('kind', [segments, failed]);

export const searchOutput = {
  results: z.array(result).describe('One per query, in the order asked'),
};

export type SearchOutput = z.infer<z.ZodObject<typeof searchOutput>>;
export type SearchResult = z.infer<typeof result>;
export type Segments = z.infer<typeof segments>;
