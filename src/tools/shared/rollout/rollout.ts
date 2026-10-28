import type { UnleashClient } from '../../../unleash/client.ts';
import { type ChangeRequest, createChangeRequestReader, routeToEnvironment } from '../changeRequest.ts';
import type { Failed } from '../failed.ts';
import { type AppliedPlan, applyPlan } from './apply.ts';
import { requestPlan } from './changeRequest.ts';
import type { EnsuredFlag } from './flag.ts';
import type { Plan } from './plan.ts';

type RolloutInput = {
  project: string;
  name: string;
  environment: string;
  ensure: () => Promise<EnsuredFlag | Failed>;
  planFor: (flag: EnsuredFlag) => Plan;
};

/** Either written directly or waiting in a change request. */
type RolledOut =
  | { kind: 'applied'; flag: EnsuredFlag; applied: AppliedPlan }
  | { kind: 'requested'; flag: EnsuredFlag; plan: Plan; changeRequest: ChangeRequest };

export const createRollout = (unleash: UnleashClient) => {
  const environmentsOf = createChangeRequestReader(unleash);
  return async ({ project, name, environment, ensure, planFor }: RolloutInput): Promise<RolledOut | Failed> => {
    // Checked before any write, so a failed check leaves Unleash untouched.
    const route = await routeToEnvironment(environmentsOf, project, environment);
    if (route.kind === 'failed') return route;

    // The flag is created directly even where changes need approval, as Unleash's own import does.
    const flag = await ensure();
    if (flag.kind === 'failed') return flag;

    const path = { projectId: project, featureName: name, environment };
    const plan = planFor(flag);

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
