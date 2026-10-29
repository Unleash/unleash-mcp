import { z } from 'zod';
import { type Failed, failed } from '../shared/failed.ts';

const docs = z.object({
  kind: z.literal('docs'),
  index: z.string().describe('The Unleash docs index: a Markdown link and summary per page'),
});

const result = z.discriminatedUnion('kind', [docs, failed]);

/** Output schema of `ask`: the docs index to read pages from, or why it couldn't be fetched. */
export const askOutput = { result };

export type Docs = z.infer<typeof docs>;
export type AskResult = Docs | Failed;
