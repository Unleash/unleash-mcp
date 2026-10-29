import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Interceptable, MockAgent } from 'undici';
import { createAsk } from './ask.ts';

// Not recorded: the docs index is not part of the Unleash sandbox, and churns.
const createStubbedFetch = (): { fetch: typeof fetch; stub: Interceptable } => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const fetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, { ...init, dispatcher: agent });
  return { fetch, stub: agent.get('https://docs.getunleash.io') };
};

const index = `# Unleash Documentation

## Instructions for AI Agents

- For clean Markdown of any page, append \`.md\` to the page URL
- For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getunleash.io/_mcp/server

## Docs

- [Feature flags](https://docs.getunleash.io/concepts/feature-flags.md): Feature flags are a core concept of Unleash.

## API Docs

- Client API > Feature flags [Get all flags (SDK)](https://docs.getunleash.io/api/get-all-client-features.md)

## OpenAPI Specification

- [OpenAPI JSON](https://docs.getunleash.io/openapi.json)
`;

test('gives the agent the docs index without the API reference or the docs MCP server', async () => {
  const { fetch, stub } = createStubbedFetch();
  stub.intercept({ path: '/llms.txt' }).reply(200, index);

  const output = await createAsk(fetch)();

  assert.deepEqual(output, {
    kind: 'docs',
    index: `# Unleash Documentation

## Instructions for AI Agents

- For clean Markdown of any page, append \`.md\` to the page URL

## Docs

- [Feature flags](https://docs.getunleash.io/concepts/feature-flags.md): Feature flags are a core concept of Unleash.`,
  });
});

test('fails with the status the docs site answers', async () => {
  const { fetch, stub } = createStubbedFetch();
  stub.intercept({ path: '/llms.txt' }).reply(503, '<html>Unavailable</html>');

  const output = await createAsk(fetch)();

  assert.deepEqual(output, { kind: 'failed', status: 503, name: 'UnknownError', reasons: [] });
});

test('fails as a network error when the docs site cannot be reached', async () => {
  const { fetch, stub } = createStubbedFetch();
  stub.intercept({ path: '/llms.txt' }).replyWithError(new Error('getaddrinfo ENOTFOUND docs.getunleash.io'));

  const output = await createAsk(fetch)();

  assert.partialDeepStrictEqual(output, { kind: 'failed', status: 0, name: 'NetworkError' });
});
