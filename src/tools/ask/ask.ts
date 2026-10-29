import { timeoutMs, toFailed, toUnreachable } from '../shared/failed.ts';
import type { AskResult } from './askOutput.ts';

/** The `ask` tool: hands the agent the Unleash docs index, to read the pages that answer the user's question. */
export type Ask = () => Promise<AskResult>;

const indexUrl = 'https://docs.getunleash.io/llms.txt';

// The API reference lists every endpoint, which the other tools already cover, at more tokens than the rest together.
const keptSections = new Set(['Instructions for AI Agents', 'Docs']);

// The docs point agents to their own MCP server, which contradicts this tool.
const docsMcpServer = 'https://docs.getunleash.io/_mcp/server';

/**
 * Keeps the parts of the docs index that answer questions about practices and concepts: the preamble and `keptSections`,
 * without the lines pointing to the docs MCP server.
 */
export const trimIndex = (index: string): string =>
  index
    .split('\n')
    // https://docs.getunleash.io/llms.txt includes the following line:
    // > - For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getunleash.io/_mcp/server
    // Which we want to filter out to avoid giving contradictory guidance to the agent.
    .filter((line) => !line.includes(docsMcpServer))
    .join('\n')
    .split(/^(?=## )/m)
    .filter((section) => {
      const heading = section.match(/^## (.+)/)?.[1]?.trim();
      return heading === undefined || keptSections.has(heading);
    })
    .join('')
    .trimEnd();

/** Creates `ask`, fetching the docs index with the given `fetch` on every call. */
export const createAsk =
  (fetch: typeof globalThis.fetch): Ask =>
    async () => {
      const response = await fetch(indexUrl, { signal: AbortSignal.timeout(timeoutMs) }).catch(toUnreachable);
      if (!(response instanceof Response)) return response;
      // The docs site answers errors in HTML, never as an Unleash error.
      if (!response.ok) return toFailed({ response });
      return { kind: 'docs', index: trimIndex(await response.text()) };
    };
