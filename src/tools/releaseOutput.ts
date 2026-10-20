import { z } from 'zod';
import { target } from './releaseInput.ts';

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

const confirm = z.object({
  kind: z.literal('confirm'),
  input: z.literal('createFlag').describe('Input to set to true once the user confirms'),
  message: z.string().describe('What to ask the user'),
});

const choose = z.object({
  kind: z.literal('choose'),
  input: z.literal('project').describe('Input to set to one of the options'),
  message: z.string().describe('What to ask the user'),
  options: z.array(z.string()),
});

const failed = z.object({
  kind: z.literal('failed'),
  status: z.number().describe('HTTP status from Unleash'),
  name: z.string().describe('Unleash error type, e.g. NotFoundError, PermissionError'),
  reasons: z.array(z.string()).describe('What Unleash said'),
});

const result = z.discriminatedUnion('kind', [released, confirm, choose, failed]);

// MCP requires an object output schema, so the union sits under `result`.
export const releaseOutput = { result };

export type Released = z.infer<typeof released>;
export type Confirm = z.infer<typeof confirm>;
export type Choose = z.infer<typeof choose>;
export type Failed = z.infer<typeof failed>;
export type ReleaseResult = Released | Confirm | Choose | Failed;
