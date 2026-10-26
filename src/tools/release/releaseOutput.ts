import { z } from 'zod';
import { target } from '../shared/target.ts';
import { failed, type Failed } from '../shared/failed.ts';
import { changeRequest } from '../shared/changeRequest.ts';
import { flagState as state } from './releaseInput.ts';

const flag = z.discriminatedUnion('status', [
  z.object({ status: z.literal('new'), name: z.string(), state }),
  z.object({ status: z.literal('existing'), name: z.string(), state }),
]);

const released = z.object({
  kind: z.literal('released'),
  flag,
  environment: z.string(),
  targets: z.array(target.required({ rollout: true })).optional().describe('The audiences that get the feature while it is on'),
  template: z.object({
    id: z.string(),
    plan: z.string().describe('The release plan copied from the template'),
    milestone: z.string().describe('The milestone being served'),
  }).optional().describe('The release template the release went through'),
  releasePlan: z.object({
    id: z.string(),
    plan: z.string().describe('The release plan name'),
    milestone: z.string().describe('The milestone being served'),
  }).optional().describe('The release plan whose milestone the release started'),
});

const pendingChangeRequest = z.object({
  kind: z.literal('pending_change_request'),
  flag,
  environment: z.string(),
  changeRequest: changeRequest.describe('The change request holding the release, submitted for review'),
  targets: z.array(target.required({ rollout: true })).optional().describe('The audiences that get the feature while it is on, once the change request is applied'),
  template: z.object({ id: z.string() }).optional().describe('The release template applied once the change request is applied'),
  releasePlan: z.object({ id: z.string(), milestone: z.string().describe('Milestone id') }).optional().describe('The release plan milestone started once the change request is applied'),
});

const result = z.discriminatedUnion('kind', [released, pendingChangeRequest, failed]);

// MCP requires an object output schema, so the union sits under `result`.
export const releaseOutput = { result };

export type Released = z.infer<typeof released>;
export type PendingChangeRequest = z.infer<typeof pendingChangeRequest>;
export type ReleaseResult = Released | PendingChangeRequest | Failed;
