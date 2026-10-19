#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readConfig } from './config.ts';
import { createServer } from './server.ts';
import { createUnleashClient } from './unleash/client.ts';

const config = readConfig(process.env);

const unleash = createUnleashClient({
  baseUrl: config.UNLEASH_BASE_URL,
  headers: { Authorization: config.UNLEASH_PAT },
  fetch: globalThis.fetch,
});

await createServer(unleash).connect(new StdioServerTransport());
