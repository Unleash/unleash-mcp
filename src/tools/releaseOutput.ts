import { z } from 'zod';
import { target } from './releaseInput.ts';

const flag = z.discriminatedUnion('status', [
  z.object({ status: z.literal('new'), name: z.string() }),
  z.object({ status: z.literal('existing'), name: z.string() }),
]);

const result = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('released'),
    flag,
    environment: z.string(),
    targets: z.array(target.required({ rollout: true })).describe('The audiences that now get the feature'),
  }),
  z.object({
    kind: z.literal('confirm'),
    input: z.literal('createFlag').describe('Input to set to true once the user confirms'),
    message: z.string().describe('What to ask the user'),
  }),
  z.object({
    kind: z.literal('choose'),
    input: z.literal('project').describe('Input to set to one of the options'),
    message: z.string().describe('What to ask the user'),
    options: z.array(z.string()),
  }),
  z.object({
    kind: z.literal('failed'),
    status: z.number().describe('HTTP status from Unleash'),
    name: z.string().describe('Unleash error type, e.g. NotFoundError, PermissionError'),
    reasons: z.array(z.string()).describe('What Unleash said'),
  }),
]);

// MCP requires an object output schema, so the union sits under `result`.
export const releaseOutput = { result };

export type ReleaseResult = z.infer<typeof result>;
