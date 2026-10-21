import { z } from 'zod';
import { target } from './releaseInput.ts';
import { failed, type Failed } from './failed.ts';

const flag = z.discriminatedUnion('status', [
  z.object({ status: z.literal('new'), name: z.string() }),
  z.object({ status: z.literal('existing'), name: z.string() }),
]);

const released = z.object({
  kind: z.literal('released'),
  flag,
  environment: z.string(),
  targets: z.array(target.required({ rollout: true })).describe('The audiences that now get the feature'),
});

const result = z.discriminatedUnion('kind', [released, failed]);

// MCP requires an object output schema, so the union sits under `result`.
export const releaseOutput = { result };

export type Released = z.infer<typeof released>;
export type ReleaseResult = Released | Failed;
