import { z } from 'zod';
import type { Decision, ReleaseResult } from './release.ts';

/** Presentation inputs: how much of a long option list to show. The workflow never sees them. */
export const presentationInput = {
  search: z.string().optional().describe('Narrow the options of a decision by substring (case-insensitive)'),
  page: z.number().int().min(1).optional().describe('Page of the options of a decision, 1-based'),
};

export type Paging = z.infer<z.ZodObject<typeof presentationInput>>;

export const PAGE_SIZE = 20;

type Paged = { options: string[]; total: number; page?: number; pages?: number };

/** Options filtered by `search` and cut to one page. `page`/`pages` are present only when the list does not fit. */
export const pageOptions = (all: string[], { search, page = 1 }: Paging): Paged => {
  // search applies to every decision in a batch; a decision where it matches nothing shows its full list instead.
  const needle = search?.toLowerCase();
  const filtered = needle ? all.filter((o) => o.toLowerCase().includes(needle)) : all;
  const matching = filtered.length > 0 ? filtered : all;
  const start = (page - 1) * PAGE_SIZE;
  const options = matching.slice(start, start + PAGE_SIZE);
  if (matching.length <= PAGE_SIZE) return { options, total: matching.length };
  return { options, total: matching.length, page, pages: Math.ceil(matching.length / PAGE_SIZE) };
};

// ---------- output schema ----------

const decisionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('choose'),
    message: z.string(),
    options: z.array(z.string()),
    total: z.number().describe('Number of options; more than shown when page/pages are present'),
    page: z.number().optional(),
    pages: z.number().optional(),
  }),
  z.object({ kind: z.literal('confirm'), id: z.string(), message: z.string() }),
]);

/** Declared as the tool's outputSchema: the workflow result, with option lists paged. */
export const outputSchema = {
  kind: z.enum(['decisions', 'failed', 'released', 'pending_change_request']),
  decisions: z.array(decisionSchema).optional().describe('kind=decisions: nothing was written; fix the input (choose) or confirm (confirm), then call again'),
  error: z.string().optional().describe('kind=failed'),
  applied: z.array(z.string()).optional().describe('kind=failed: writes completed before the failure; calling again with the same input finishes the release'),
  flag: z.string().optional(),
  environment: z.string().optional(),
  strategies: z.array(z.string()).optional().describe('One line per audience, as applied or proposed'),
  changeRequest: z.object({ id: z.number(), state: z.string() }).optional()
    .describe('kind=pending_change_request: nothing is applied until the change request is submitted, approved and applied'),
};

export type Output = z.infer<z.ZodObject<typeof outputSchema>>;

const pageDecision = (d: Decision, paging: Paging) => (d.kind === 'choose' ? { ...d, ...pageOptions(d.options, paging) } : d);

/** The MCP tool result: structured content, with the same JSON in the text block for clients that do not read it. */
export const present = (r: ReleaseResult, paging: Paging) => {
  const output: Output = r.kind === 'decisions' ? { ...r, decisions: r.decisions.map((d) => pageDecision(d, paging)) } : r;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(output) }],
    structuredContent: output,
    isError: r.kind === 'failed',
  };
};
