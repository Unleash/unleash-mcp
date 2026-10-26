import type { UnleashClient } from '../../unleash/client.ts';
import type { FlagLifecycleInput, Operation } from './flagLifecycleInput.ts';
import type { FlagLifecycleOutput, FlagLifecycleResult, Outcome, PendingChange } from './flagLifecycleOutput.ts';
import { type ChangeRequestReader, createChangeRequestReader } from '../shared/changeRequest.ts';
import { archiveFlag } from './archive.ts';
import { completeFlag } from './complete.ts';
import { deleteArchivedFlag } from './delete.ts';
import { defineFlag } from './define.ts';
import { reviveFlag } from './revive.ts';

/** Builds the flag lifecycle tool: applies the operations one after another, one result per operation. */
export const createFlagLifecycle = (unleash: UnleashClient) => {
  const environmentsOf = createChangeRequestReader(unleash);
  return async ({ operations }: FlagLifecycleInput): Promise<FlagLifecycleOutput> => {
    const results: FlagLifecycleResult[] = [];
    for (const operation of operations) results.push(resultOf(operation, await apply(unleash, environmentsOf, operation)));
    return { results };
  };
};

const apply = (unleash: UnleashClient, environmentsOf: ChangeRequestReader, operation: Operation): Promise<Outcome | PendingChange> => {
  switch (operation.action) {
    case 'define': return defineFlag(unleash, operation);
    case 'complete': return completeFlag(unleash, operation);
    case 'archive': return archiveFlag(unleash, environmentsOf, operation);
    case 'revive': return reviveFlag(unleash, operation);
    case 'delete': return deleteArchivedFlag(unleash, operation);
  }
};

const resultOf = ({ action, project, flag }: Operation, outcome: Outcome | PendingChange): FlagLifecycleResult => {
  // Only define answers a status and what changed, and only archive waits for a change request, which the types
  // can't tie to `action`.
  if (outcome.kind !== 'failed') return { ...outcome, action, project, flag } as FlagLifecycleResult;
  const { kind, ...error } = outcome;
  return { kind: 'failed', action, project, flag, error };
};
