import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './api.d.ts';

// The base URL is where the Unleash UI lives too, so tools can link people to it.
export type UnleashClient = Client<paths> & { baseUrl: string };

export type UnleashClientOptions = {
  baseUrl: string;
  headers: Record<string, string>;
  fetch: typeof fetch;
};

export const createUnleashClient = ({ baseUrl, headers, fetch }: UnleashClientOptions): UnleashClient =>
  Object.assign(createClient<paths>({ baseUrl, headers, fetch }), { baseUrl });
