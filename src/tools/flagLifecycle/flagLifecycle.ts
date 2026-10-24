import type { UnleashClient } from '../../unleash/client.ts';
import type { FlagLifecycleInput, Operation } from './flagLifecycleInput.ts';
import type { FlagLifecycleOutput, FlagLifecycleResult, Outcome } from './flagLifecycleOutput.ts';
import { completeFlag } from './complete.ts';
import { defineFlag } from './define.ts';

/** Builds the flag lifecycle tool: applies the operations one after another, one result per operation. */
export const createFlagLifecycle =
  (unleash: UnleashClient) =>
    async ({ operations }: FlagLifecycleInput): Promise<FlagLifecycleOutput> => {
      const results: FlagLifecycleResult[] = [];
      for (const operation of operations) results.push(resultOf(operation, await apply(unleash, operation)));
      return { results };
    };

const apply = (unleash: UnleashClient, operation: Operation): Promise<Outcome> => {
  switch (operation.action) {
    case 'define': return defineFlag(unleash, operation);
    case 'complete': return completeFlag(unleash, operation);
  }
};

const resultOf = ({ action, project, flag }: Operation, outcome: Outcome): FlagLifecycleResult => {
  // Only define answers a status and what changed, which the types can't tie to `action`.
  if (outcome.kind === 'applied') return { ...outcome, action, project, flag } as FlagLifecycleResult;
  const { kind, ...error } = outcome;
  return { kind: 'failed', action, project, flag, error };
};
