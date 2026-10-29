import type { UnleashClient } from '../../../unleash/client.ts';
import { type ChangeRequest, createChangeRequestReader, routeToEnvironment } from '../changeRequest.ts';
import type { Failed } from '../failed.ts';
import type { FlagState } from '../flagState.ts';
import { type AppliedPlan, applyPlan } from './apply.ts';
import { requestPlan } from './changeRequest.ts';
import { ensureFlag } from './ensureFlag.ts';
import type { FlagOptions, RolledOutFlag } from './flag.ts';
import type { EnvironmentState, Plan } from './plan.ts';

type RolloutInput = {
  project: string;
  flag: { name: string; state: FlagState };
  environment: string;
  /** What a missing flag is created with. */
  whenMissing?: FlagOptions;
  /** Called with what the environment has once the flag is read, since the plan reuses its strategies and writes the state only when it changes. */
  planFor: (current: EnvironmentState) => Plan;
};

/** Either written directly or waiting in a change request, with the flag as the tools report it. */
type RolledOut =
  | { kind: 'applied'; flag: RolledOutFlag; applied: AppliedPlan }
  | { kind: 'requested'; flag: RolledOutFlag; plan: Plan; changeRequest: ChangeRequest };

export const createRollout = (unleash: UnleashClient) => {
  const environmentsOf = createChangeRequestReader(unleash);
  return async ({
    project,
    flag: { name, state },
    environment,
    whenMissing,
    planFor,
  }: RolloutInput): Promise<RolledOut | Failed> => {
    // Checked before any write, so a failed check leaves Unleash untouched.
    const route = await routeToEnvironment(environmentsOf, project, environment);
    if (route.kind === 'failed') return route;

    // The flag is created directly even where changes need approval, as Unleash's own import does.
    const ensured = await ensureFlag(unleash, project, { flag: name, environment, whenMissing });
    if (ensured.kind === 'failed') return ensured;
    const flag = { origin: ensured.kind, name, state };

    const path = { projectId: project, featureName: name, environment };
    const plan = planFor(ensured);

    if (route.kind === 'changeRequest') {
      const requested = await requestPlan(unleash, path, plan);
      if (requested.kind === 'failed') return requested;
      return { kind: 'requested', flag, plan, changeRequest: requested.changeRequest };
    }

    const applied = await applyPlan(unleash, path, plan);
    if (applied.kind === 'failed') return applied;
    return { kind: 'applied', flag, applied };
  };
};
