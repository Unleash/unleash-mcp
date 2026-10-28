#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pkg from '../package.json' with { type: 'json' };
import { readConfig } from './config.ts';
import { createServer } from './server.ts';
import { createConsent, granted } from './tools/sendFeedback/consent.ts';
import { createConsentStore, platformConfigDir } from './tools/sendFeedback/consentStore.ts';
import { createSendFeedback } from './tools/sendFeedback/sendFeedback.ts';
import { createUnleashClient } from './unleash/client.ts';

const config = readConfig(process.env);

const unleash = createUnleashClient({
  baseUrl: config.UNLEASH_BASE_URL,
  headers: { Authorization: config.UNLEASH_PAT },
  fetch: globalThis.fetch,
});

const configDir = config.UNLEASH_MCP_CONFIG_DIR ?? platformConfigDir(process.env, process.platform, homedir());
const consentStore = createConsentStore(join(configDir, 'feedback_consent.json'), () => new Date());

// true grants, false leaves send_feedback out, unset asks the user.
const consent = config.UNLEASH_MCP_SEND_FEEDBACK ? granted : createConsent(consentStore);
const sendFeedback =
  config.UNLEASH_MCP_SEND_FEEDBACK === false
    ? undefined
    : createSendFeedback(globalThis.fetch, pkg.version, config.UNLEASH_FEEDBACK_URL, consent);

await createServer(unleash, sendFeedback).connect(new StdioServerTransport());
