import type { UnleashClient } from '../unleash/client.ts';
import type { Constraint, ReleaseInput, Target } from './releaseInput.ts';
import type { ReleaseResult } from './releaseOutput.ts';
import { toFailed } from './failed.ts';
import { ensureFlag } from './flag.ts';
import { pickProject } from './project.ts';

const strategies = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies';
const strategy = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies/{strategyId}';
const enable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on';

export const createRelease =
  (unleash: UnleashClient) =>
    async (input: ReleaseInput): Promise<ReleaseResult> => {
      const pick = await pickProject(unleash, input.project);
      if (pick.kind !== 'picked') return pick;
      const project = pick.project;

      const flag = await ensureFlag(unleash, project, input);
      if (flag.kind === 'confirm' || flag.kind === 'failed') return flag;

      // Existing strategies are reused by position so their history survives. Surplus ones go last,
      // so the environment never has zero strategies, which would make Unleash disable it.
      const path = { projectId: project, featureName: input.flag, environment: input.environment };
      for (const [i, target] of input.targets.entries()) {
        const id = flag.strategyIds[i];
        const body = toStrategy(input.flag, target);
        const written = id
          ? await unleash.PUT(strategy, { params: { path: { ...path, strategyId: id } }, body })
          : await unleash.POST(strategies, { params: { path }, body });
        if (!written.response.ok) return toFailed(written);
      }
      for (const id of flag.strategyIds.slice(input.targets.length)) {
        const deleted = await unleash.DELETE(strategy, { params: { path: { ...path, strategyId: id } } });
        if (!deleted.response.ok) return toFailed(deleted);
      }

      if (!flag.enabled) {
        const enabled = await unleash.POST(enable, { params: { path } });
        if (!enabled.response.ok) return toFailed(enabled);
      }

      return {
        kind: 'released',
        flag: { status: flag.kind, name: input.flag },
        environment: input.environment,
        targets: input.targets.map((t) => ({ ...t, rollout: rolloutOf(t) })),
      };
    };

const rolloutOf = (target: Target): number => target.rollout ?? 100;

const toStrategy = (flag: string, target: Target) => ({
  name: 'flexibleRollout',
  title: target.name,
  parameters: { rollout: String(rolloutOf(target)), stickiness: 'default', groupId: flag },
  constraints: (target.constraints ?? []).map(toConstraint),
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
