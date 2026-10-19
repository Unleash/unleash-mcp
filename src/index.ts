#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.ts';
import { createUnleashClient } from './unleash/client.ts';

const unleash = createUnleashClient({
  baseUrl: process.env.UNLEASH_BASE_URL ?? '',
  headers: { Authorization: process.env.UNLEASH_PAT ?? '' },
  fetch,
});
await createServer(unleash).connect(new StdioServerTransport());
