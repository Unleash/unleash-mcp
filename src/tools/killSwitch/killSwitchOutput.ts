import { z } from 'zod';
import { changeRequest } from '../shared/changeRequest.ts';
import { type Failed, failed } from '../shared/failed.ts';
import { rolledOutFlag as flag } from '../shared/rollout/flag.ts';
import { target } from '../shared/target.ts';

const targets = z.array(target.required({ rollout: true, stickiness: true }));

const switched = z.object({
  kind: z.literal('switched'),
  flag,
  environment: z.string(),
  targets: targets.describe('Who the switch is on for'),
});

const pendingChangeRequest = z.object({
  kind: z.literal('pending_change_request'),
  flag,
  environment: z.string(),
  changeRequest: changeRequest.describe('The change request holding the switch, submitted for review'),
  targets: targets.describe('Who the switch is on for, once the change request is applied'),
});

const result = z.discriminatedUnion('kind', [switched, pendingChangeRequest, failed]);

// MCP requires an object output schema, so the union sits under `result`.
export const killSwitchOutput = { result };

export type KillSwitchResult = z.infer<typeof switched> | z.infer<typeof pendingChangeRequest> | Failed;
