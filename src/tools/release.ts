import type { UnleashClient } from '../unleash/client.ts';
import type { Constraint, ReleaseInput, Target } from './releaseInput.ts';
import type { ReleaseResult } from './releaseOutput.ts';
import { type Failed, toFailed } from './failed.ts';
import { pickEnvironment } from './environment.ts';
import { ensureFlag } from './flag.ts';
import { pickProject } from './project.ts';
import { pickSegments } from './segment.ts';

const strategies = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies';
const strategy = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies/{strategyId}';
const enable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on';

type EnvironmentPath = { projectId: string; featureName: string; environment: string };

export const createRelease =
  (unleash: UnleashClient) =>
    async (input: ReleaseInput): Promise<ReleaseResult> => {
      const pick = await pickProject(unleash, input.project);
      if (pick.kind !== 'picked') return pick;
      const project = pick.project;

      const picked = await pickEnvironment(unleash, project, input.environment);
      if (picked.kind !== 'picked') return picked;
      const environment = picked.environment;

      const segments = await pickSegments(unleash, project, input.targets.flatMap((t) => t.segments ?? []));
      if (segments.kind !== 'picked') return segments;

      const flag = await ensureFlag(unleash, project, { ...input, environment });
      if (flag.kind === 'confirm' || flag.kind === 'failed') return flag;

      const path = { projectId: project, featureName: input.flag, environment };
      const replaced = await replaceTargets(unleash, path, input.targets, flag.strategyIds, segments.ids);
      if (replaced.kind === 'failed') return replaced;

      const enabled = await enableEnvironment(unleash, path, flag.enabled);
      if (enabled.kind === 'failed') return enabled;

      return {
        kind: 'released',
        flag: { status: flag.kind, name: input.flag },
        environment,
        targets: input.targets.map((t) => ({ ...t, rollout: rolloutOf(t) })),
      };
    };

// Existing strategies are reused by position so their history survives. Surplus ones go last,
// so the environment never has zero strategies, which would make Unleash disable it.
const replaceTargets = async (
  unleash: UnleashClient,
  path: EnvironmentPath,
  targets: Target[],
  strategyIds: string[],
  segmentIds: Map<string, number>,
): Promise<{ kind: 'replaced' } | Failed> => {
  for (const [i, target] of targets.entries()) {
    const id = strategyIds[i];
    const body = toStrategy(path.featureName, target, segmentIds);
    const written = id
      ? await unleash.PUT(strategy, { params: { path: { ...path, strategyId: id } }, body })
      : await unleash.POST(strategies, { params: { path }, body });
    if (!written.response.ok) return toFailed(written);
  }
  for (const id of strategyIds.slice(targets.length)) {
    const deleted = await unleash.DELETE(strategy, { params: { path: { ...path, strategyId: id } } });
    if (!deleted.response.ok) return toFailed(deleted);
  }
  return { kind: 'replaced' };
};

const enableEnvironment = async (unleash: UnleashClient, path: EnvironmentPath, enabled: boolean): Promise<{ kind: 'enabled' } | Failed> => {
  if (enabled) return { kind: 'enabled' };
  const done = await unleash.POST(enable, { params: { path } });
  if (!done.response.ok) return toFailed(done);
  return { kind: 'enabled' };
};

const rolloutOf = (target: Target): number => target.rollout ?? 100;

const toStrategy = (flag: string, target: Target, segmentIds: Map<string, number>) => ({
  name: 'flexibleRollout',
  title: target.name,
  parameters: { rollout: String(rolloutOf(target)), stickiness: 'default', groupId: flag },
  constraints: (target.constraints ?? []).map(toConstraint),
  segments: (target.segments ?? []).map((name) => segmentIds.get(name)!),
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
