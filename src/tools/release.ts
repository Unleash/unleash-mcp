import type { UnleashClient } from '../unleash/client.ts';
import type { Constraint, ReleaseInput, Target } from './releaseInput.ts';
import type { ReleaseResult } from './releaseOutput.ts';
import { toFailed } from './failed.ts';
import { ensureFlag } from './flag.ts';
import { pickProject } from './project.ts';

const strategies = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies';
const enable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on';

export const createRelease =
  (unleash: UnleashClient) =>
    async (input: ReleaseInput): Promise<ReleaseResult> => {
      const pick = await pickProject(unleash, input.project);
      if (pick.kind !== 'picked') return pick;
      const project = pick.project;

      const flag = await ensureFlag(unleash, project, input);
      if (flag.kind === 'confirm' || flag.kind === 'failed') return flag;

      const path = { projectId: project, featureName: input.flag, environment: input.environment };
      for (const target of input.targets) {
        const added = await unleash.POST(strategies, { params: { path }, body: toStrategy(input.flag, target) });
        if (!added.response.ok) return toFailed(added);
      }

      const enabled = await unleash.POST(enable, { params: { path } });
      if (!enabled.response.ok) return toFailed(enabled);

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

