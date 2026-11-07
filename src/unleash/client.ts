import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './api.d.ts';

// The base URL is where the Unleash UI lives too, so tools can link people to it.
export type UnleashClient = Client<paths> & { baseUrl: string };

export type UnleashClientOptions = {
  baseUrl: string;
  headers: Record<string, string>;
  fetch: typeof fetch;
};

export const createUnleashClient = ({ baseUrl, headers, fetch }: UnleashClientOptions): UnleashClient => {
  const base = baseUrl.replace(/\/+$/, '');
  return Object.assign(createClient<paths>({ baseUrl: base, headers, fetch }), { baseUrl: base });
};

// Unleash SDKs name themselves in these headers, and Unleash labels its request metrics with the app name.
// The servers send them and test clients don't: recorded snapshots hash the request headers.
export const identifyingHeaders = (mcpVersion: string): Record<string, string> => ({
  'unleash-appname': 'unleash-mcp',
  'user-agent': `unleash-mcp/${mcpVersion}`,
});
