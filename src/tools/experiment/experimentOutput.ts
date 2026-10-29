import { z } from 'zod';
import { changeRequest } from '../shared/changeRequest.ts';
import { type Failed, failed } from '../shared/failed.ts';
import { rolledOutFlag as flag } from '../shared/rollout/flag.ts';
import { target } from '../shared/target.ts';

const targets = z.array(target.required({ rollout: true, stickiness: true, values: true }));

const split = z.object({
  kind: z.literal('split'),
  flag,
  environment: z.string(),
  targets: targets.describe('The audiences in the experiment, each split across its values'),
});

const pendingChangeRequest = z.object({
  kind: z.literal('pending_change_request'),
  flag,
  environment: z.string(),
  changeRequest: changeRequest.describe('The change request holding the experiment, submitted for review'),
  targets: targets.describe('The audiences in the experiment once the change request is applied'),
});

const result = z.discriminatedUnion('kind', [split, pendingChangeRequest, failed]);

// MCP requires an object output schema, so the union sits under `result`.
export const experimentOutput = { result };

export type ExperimentResult = z.infer<typeof split> | z.infer<typeof pendingChangeRequest> | Failed;
