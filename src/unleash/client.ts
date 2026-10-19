import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './api.d.ts';

export type UnleashClient = Client<paths>;

export type UnleashClientOptions = {
  baseUrl: string;
  headers: Record<string, string>;
  fetch: typeof fetch;
};

export const createUnleashClient = ({ baseUrl, headers, fetch }: UnleashClientOptions): UnleashClient =>
  createClient<paths>({ baseUrl, headers, fetch });
