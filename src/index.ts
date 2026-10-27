#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pkg from '../package.json' with { type: 'json' };
import { readConfig } from './config.ts';
import { createServer } from './server.ts';
import { createSendFeedback } from './tools/sendFeedback/sendFeedback.ts';
import { createUnleashClient } from './unleash/client.ts';

const config = readConfig(process.env);

const unleash = createUnleashClient({
  baseUrl: config.UNLEASH_BASE_URL,
  headers: { Authorization: config.UNLEASH_PAT },
  fetch: globalThis.fetch,
});

const sendFeedback = config.UNLEASH_MCP_SEND_FEEDBACK ? createSendFeedback(globalThis.fetch, pkg.version, config.UNLEASH_FEEDBACK_URL) : undefined;

await createServer(unleash, sendFeedback).connect(new StdioServerTransport());
