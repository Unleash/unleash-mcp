import type { UnleashClient } from '../unleash/client.ts';
import type { Constraint, ReleaseInput, Target } from './releaseInput.ts';
import type { ReleaseResult } from './releaseOutput.ts';
import { type Failed, toFailed } from './failed.ts';
import { ensureFlag } from './flag.ts';
import { createRouter } from './changeRequest.ts';

const strategies = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies';
const strategy = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies/{strategyId}';
const enable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on';

type EnvironmentPath = { projectId: string; featureName: string; environment: string };

export const createRelease = (unleash: UnleashClient) => {
  const routeOf = createRouter(unleash);
  return async (input: ReleaseInput): Promise<ReleaseResult> => {
    const { project, environment } = input;
    // Checked before any write, so a failed check leaves Unleash untouched.
    const route = await routeOf(project, environment);
    if (route.kind === 'failed') return route;

    const flag = await ensureFlag(unleash, project, input);
    if (flag.kind === 'failed') return flag;

    const path = { projectId: project, featureName: input.flag, environment };
    const applied = await applyPlan(unleash, path, planRelease(input.flag, input.targets, flag));
    if (applied.kind === 'failed') return applied;

    return {
      kind: 'released',
      flag: { status: flag.kind, name: input.flag },
      environment,
      targets: input.targets.map((t) => ({ ...t, rollout: rolloutOf(t) })),
    };
  };
};

type Strategy = ReturnType<typeof toStrategy>;

type Plan = { updates: { id: string; strategy: Strategy }[]; adds: Strategy[]; deletes: string[]; enable: boolean };

// Existing strategies are reused by position so their history survives.
const planRelease = (flag: string, targets: Target[], current: { enabled: boolean; strategyIds: string[] }): Plan => {
  const plan: Plan = { updates: [], adds: [], deletes: current.strategyIds.slice(targets.length), enable: !current.enabled };
  for (const [i, target] of targets.entries()) {
    const id = current.strategyIds[i];
    const strategy = toStrategy(flag, target);
    if (id) plan.updates.push({ id, strategy });
    else plan.adds.push(strategy);
  }
  return plan;
};

// Surplus strategies go last, so the environment never has zero strategies, which would make Unleash disable it.
// Enabling goes after them, once the environment has its audiences.
const applyPlan = async (unleash: UnleashClient, path: EnvironmentPath, plan: Plan): Promise<{ kind: 'applied' } | Failed> => {
  for (const { id, strategy: body } of plan.updates) {
    const updated = await unleash.PUT(strategy, { params: { path: { ...path, strategyId: id } }, body });
    if (!updated.response.ok) return toFailed(updated);
  }
  for (const body of plan.adds) {
    const added = await unleash.POST(strategies, { params: { path }, body });
    if (!added.response.ok) return toFailed(added);
  }
  for (const id of plan.deletes) {
    const deleted = await unleash.DELETE(strategy, { params: { path: { ...path, strategyId: id } } });
    if (!deleted.response.ok) return toFailed(deleted);
  }
  if (plan.enable) {
    const enabled = await unleash.POST(enable, { params: { path } });
    if (!enabled.response.ok) return toFailed(enabled);
  }
  return { kind: 'applied' };
};

const rolloutOf = (target: Target): number => target.rollout ?? 100;

const toStrategy = (flag: string, target: Target) => ({
  name: 'flexibleRollout',
  title: target.name,
  parameters: { rollout: String(rolloutOf(target)), stickiness: 'default', groupId: flag },
  constraints: (target.constraints ?? []).map(toConstraint),
  segments: target.segments ?? [],
  // Unleash rejects a lone variant with a fixed weight, so it takes all of the variable weight.
  variants: target.value ? [{ ...target.value, weight: 1000, weightType: 'variable' as const, stickiness: 'default' }] : [],
});

const toConstraint = (c: Constraint) => ({
  contextName: c.field,
  operator: c.operator,
  values: c.values,
  inverted: c.inverted ?? false,
  caseInsensitive: c.caseInsensitive ?? false,
});
