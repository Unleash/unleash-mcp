import { z } from 'zod';

const project = z.string().describe('Project id');
const query = z.string().describe('Case-insensitive text the id or name contains');

const projects = z.object({ kind: z.literal('projects'), query: query.optional() });
const environments = z.object({ kind: z.literal('environments'), project });
const segments = z.object({ kind: z.literal('segments'), project, query: query.optional() });
const flags = z.object({ kind: z.literal('flags'), project, query });
const contextFields = z.object({ kind: z.literal('contextFields'), query: query.optional() });
const audiences = z.object({ kind: z.literal('audiences'), project, flag: z.string(), environment: z.string() });

const lookup = z.discriminatedUnion('kind', [projects, environments, segments, flags, contextFields, audiences]);

// MCP requires an object input schema, so the union sits under `lookup`.
export const searchInput = { lookup };

export type SearchInput = z.infer<z.ZodObject<typeof searchInput>>;
export type Lookup = z.infer<typeof lookup>;
