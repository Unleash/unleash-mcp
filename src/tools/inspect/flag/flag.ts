import type { components } from '../../../unleash/api.d.ts';
import type { UnleashClient } from '../../../unleash/client.ts';
import type { FlagQuery } from '../inspectInput.ts';
import type { Environment, Flag, Lifecycle, Milestone, Parent, ReleasePlan, Transition } from '../inspectOutput.ts';
import type { Link } from '../../shared/link.ts';
import type { FlagType } from '../../shared/flagType.ts';
import type { Tag } from '../../shared/tag.ts';
import type { Target, Value } from '../../shared/target.ts';
import { toConstraint, type UnleashConstraint } from '../../shared/constraint.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import { toLifecycleStage, type UnleashStage } from '../../shared/lifecycleStage.ts';

export const inspectFlag = async (unleash: UnleashClient, { project, flag }: FlagQuery): Promise<Flag | Failed> => {
  // The flag endpoint leaves the tags out, so they take a request of their own.
  const [found, tagged] = await Promise.all([
    unleash.GET('/api/admin/projects/{projectId}/features/{featureName}', { params: { path: { projectId: project, featureName: flag } } }),
    unleash.GET('/api/admin/features/{featureName}/tags', { params: { path: { featureName: flag } } }),
  ]);
  if (!found.response.ok || !found.data) return toFailed(found);
  if (!tagged.response.ok || !tagged.data) return toFailed(tagged);
  const { name, type, createdAt, createdBy, lifecycle, expectedLifetimeEndsAt, environments, collaborators, dependencies, children, links } = found.data;
  const tags = tagged.data.tags;
  const collaboratorNames = collaborators?.users.map((user) => user.name) ?? [];
  return {
    kind: 'flag',
    name,
    type: type as FlagType,
    ...(lifecycle ? { lifecycle: toLifecycle(lifecycle) } : {}),
    // Unleash returns `expectedLifetimeEndsAt` but leaves it out of its OpenAPI spec, hence the type check.
    ...(typeof expectedLifetimeEndsAt === 'string' ? { expectedLifetimeEndsAt } : {}),
    environments: (environments ?? []).map(toEnvironment),
    ...(createdAt ? { createdAt } : {}),
    ...(createdBy ? { createdBy: createdBy.name } : {}),
    ...(collaboratorNames.length ? { collaborators: collaboratorNames } : {}),
    ...(dependencies?.[0] ? { parent: toParent(dependencies[0]) } : {}),
    ...(children?.length ? { children } : {}),
    ...(tags?.length ? { tags: tags.map(toTag) } : {}),
    ...(links?.length ? { links: links.map(toLink) } : {}),
  };
};

type UnleashEnvironment = components['schemas']['featureEnvironmentSchema'];
type UnleashReleasePlan = components['schemas']['releasePlanSchema'];
type UnleashVariant = components['schemas']['strategyVariantSchema'];
// What a feature strategy and a release plan milestone strategy have in common.
type UnleashStrategy = {
  name: string;
  title?: string | null;
  parameters?: Record<string, string>;
  constraints?: UnleashConstraint[];
  segments?: number[];
  variants?: UnleashVariant[];
};

// Unleash allows one release plan per environment; its schema is an array anyway.
const toEnvironment = ({ name, enabled, lastSeenAt, strategies, releasePlans }: UnleashEnvironment): Environment => ({
  name,
  enabled,
  ...(lastSeenAt ? { lastSeenAt } : {}),
  ...(strategies?.length ? { targets: strategies.map(toTarget) } : {}),
  ...(releasePlans?.[0] ? { releasePlan: toReleasePlan(releasePlans[0]) } : {}),
});

const toReleasePlan = ({ name, milestones, activeMilestoneId }: UnleashReleasePlan): ReleasePlan => ({
  name,
  milestones: milestones.map(({ id, name, transitionCondition, strategies }): Milestone => ({
    name,
    ...(id === activeMilestoneId ? { active: true } : {}),
    ...(transitionCondition ? { transition: toTransition(transitionCondition) } : {}),
    ...(strategies?.length ? { targets: strategies.map(toTarget) } : {}),
  })),
});

// TODO: take `transitionConditionSchema` directly once the spec uses it on a plan milestone instead of an empty object.
const toTransition = (condition: object): Transition => {
  const c = condition as components['schemas']['transitionConditionSchema'];
  return c.type === 'exposure' ? { type: 'exposure', minimumExposures: c.minimumExposures } : { type: 'time', intervalMinutes: c.intervalMinutes };
};

// The reverse of the release plan's toStrategy, so a target can be edited and released again.
const toTarget = (s: UnleashStrategy): Target & { rollout: number } => ({
  name: s.title || s.name,
  rollout: Number(s.parameters?.rollout ?? 100),
  ...(s.constraints?.length ? { constraints: s.constraints.map(toConstraint) } : {}),
  ...(s.segments?.length ? { segments: s.segments } : {}),
  ...(s.variants?.length ? { values: s.variants.map(toValue) } : {}),
});

// A variable weight is what Unleash resolved, not what was asked for, so only a fixed one comes back as a share.
const toValue = ({ name, payload, weight, weightType }: UnleashVariant): Value => ({
  name,
  ...(payload ? { payload } : {}),
  ...(weightType === 'fix' ? { share: weight / 10 } : {}),
});

const toLifecycle = ({ stage, status, enteredStageAt }: { stage: UnleashStage; status?: string | null; enteredStageAt: string }): Lifecycle => ({
  stage: toLifecycleStage(stage),
  ...(status ? { status } : {}),
  enteredAt: enteredStageAt,
});

// Unleash allows one parent per flag; its schema is an array anyway.
const toParent = ({ feature, enabled, variants }: { feature: string; enabled?: boolean; variants?: string[] }): Parent => ({
  flag: feature,
  ...(enabled === false ? { enabled } : {}),
  ...(variants?.length ? { variants } : {}),
});

const toTag = ({ type, value }: Tag): Tag => ({ type, value });

const toLink = ({ url, title }: { url: string; title?: string | null }): Link => ({ url, ...(title ? { title } : {}) });
