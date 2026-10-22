import { z } from 'zod';
import { target } from '../shared/target.ts';
import { failed } from '../shared/failed.ts';

const projects = z.object({ kind: z.literal('projects'), projects: z.array(z.object({ id: z.string(), name: z.string() })) });
const environments = z.object({ kind: z.literal('environments'), environments: z.array(z.string()).describe('Enabled environments only') });
const segments = z.object({
  kind: z.literal('segments'),
  segments: z.array(z.object({ id: z.number(), name: z.string() })).describe('Usable in the project: global or owned by it'),
});
const flags = z.object({ kind: z.literal('flags'), flags: z.array(z.object({ name: z.string() })) });
const contextFields = z.object({
  kind: z.literal('contextFields'),
  fields: z.array(z.object({ name: z.string(), legalValues: z.array(z.string()).optional() })),
});
const audiences = z.object({
  kind: z.literal('audiences'),
  enabled: z.boolean(),
  targets: z.array(target).describe('Same shape release takes, so it can be edited and sent back'),
});

const result = z.discriminatedUnion('kind', [projects, environments, segments, flags, contextFields, audiences, failed]);

// MCP requires an object output schema, so the union sits under `result`.
export const searchSpikeOutput = { result };

export type SearchResult = z.infer<typeof result>;
