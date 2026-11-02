import { z } from 'zod';
import { type Failed, failed } from '../shared/failed.ts';

const docsIndex = z.object({
  kind: z.literal('docs'),
  index: z.string().describe('The Unleash docs index: a Markdown link and summary per page'),
});

const result = z.discriminatedUnion('kind', [docsIndex, failed]);

/** Output schema of `docs`: the docs index to read pages from, or why it couldn't be fetched. */
export const docsOutput = { result };

export type DocsIndex = z.infer<typeof docsIndex>;
export type DocsResult = DocsIndex | Failed;
