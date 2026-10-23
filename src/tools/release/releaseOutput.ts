import { z } from 'zod';
import { target } from '../shared/target.ts';
import { failed, type Failed } from '../shared/failed.ts';
import { flagState as state } from './releaseInput.ts';

const flag = z.discriminatedUnion('status', [
  z.object({ status: z.literal('new'), name: z.string(), state }),
  z.object({ status: z.literal('existing'), name: z.string(), state }),
]);

const released = z.object({
  kind: z.literal('released'),
  flag,
  environment: z.string(),
  targets: z.array(target.required({ rollout: true })).describe('The audiences that get the feature while it is on'),
});

const pendingChangeRequest = z.object({
  kind: z.literal('pending_change_request'),
  flag,
  environment: z.string(),
  changeRequest: z.object({ id: z.number(), state: z.string() }).describe('The change request holding the release, submitted for review'),
  targets: z.array(target.required({ rollout: true })).describe('The audiences that get the feature while it is on, once the change request is applied'),
});

const result = z.discriminatedUnion('kind', [released, pendingChangeRequest, failed]);

// MCP requires an object output schema, so the union sits under `result`.
export const releaseOutput = { result };

export type Released = z.infer<typeof released>;
export type PendingChangeRequest = z.infer<typeof pendingChangeRequest>;
export type ReleaseResult = Released | PendingChangeRequest | Failed;
