import type { components } from '../../../unleash/api.d.ts';
import type { UnleashClient } from '../../../unleash/client.ts';
import { changeRequestUrl, type EditionReader } from '../../shared/changeRequest.ts';
import { toConstraint, type UnleashConstraint } from '../../shared/constraint.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import { toFlagState } from '../../shared/flagState.ts';
import type { FlagType } from '../../shared/flagType.ts';
import { toLifecycleStage, type UnleashStage } from '../../shared/lifecycleStage.ts';
import type { Link } from '../../shared/link.ts';
import type { Parent } from '../../shared/parent.ts';
import type { Tag } from '../../shared/tag.ts';
import type { Target, Value } from '../../shared/target.ts';
import type { FlagQuery } from '../inspectInput.ts';
import type { Environment, Flag, Lifecycle, Milestone, PendingChangeRequest, ReleasePlan, Transition } from '../inspectOutput.ts';

export const inspectFlag = async (unleash: UnleashClient, editionOf: EditionReader, { project, flag }: FlagQuery): Promise<Flag | Failed> => {
  // The flag endpoint leaves the tags and the change requests out, so they take requests of their own.
  const [found, tagged, pending] = await Promise.all([
    unleash.GET('/api/admin/projects/{projectId}/features/{featureName}', { params: { path: { projectId: project, featureName: flag } } }),
    unleash.GET('/api/admin/features/{featureName}/tags', { params: { path: { featureName: flag } } }),
    readPendingChangeRequests(unleash, editionOf, project, flag),
  ]);
  if (!found.response.ok || !found.data) return toFailed(found);
  if (!tagged.response.ok || !tagged.data) return toFailed(tagged);
  if (pending.kind === 'failed') return pending;
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
    ...(pending.changeRequests.length ? { changeRequests: pending.changeRequests } : {}),
  };
};

// Only Enterprise has change requests, so other editions skip the read.
const readPendingChangeRequests = async (unleash: UnleashClient, editionOf: EditionReader, project: string, flag: string): Promise<{ kind: 'changeRequests'; changeRequests: PendingChangeRequest[] } | Failed> => {
  const edition = await editionOf();
  if (edition.kind === 'failed') return edition;
  if (edition.kind === 'other') return { kind: 'changeRequests', changeRequests: [] };

  const found = await unleash.GET('/api/admin/projects/{projectId}/change-requests/pending/{featureName}', { params: { path: { projectId: project, featureName: flag } } });
  if (!found.response.ok || !found.data) return toFailed(found);
  const changeRequests = found.data.map(({ id, state, environment }) => ({ id, state, environment, url: changeRequestUrl(unleash, project, id) }));
  return { kind: 'changeRequests', changeRequests };
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
  state: toFlagState(enabled),
  ...(lastSeenAt ? { lastSeenAt } : {}),
  ...(strategies?.length ? { targets: strategies.map(toTarget) } : {}),
  ...(releasePlans?.[0] ? { releasePlan: toReleasePlan(releasePlans[0]) } : {}),
});

const toReleasePlan = ({ id: planId, name, milestones, activeMilestoneId }: UnleashReleasePlan): ReleasePlan => ({
  id: planId,
  name,
  milestones: milestones.map(({ id, name, transitionCondition, strategies }): Milestone => ({
    id,
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
const toParent = ({ feature, enabled, variants }: { feature: string; enabled?: boolean; variants?: string[] }): Parent =>
  enabled === false ? { kind: 'off', flag: feature } : { kind: 'on', flag: feature, ...(variants?.length ? { values: variants } : {}) };

const toTag = ({ type, value }: Tag): Tag => ({ type, value });

const toLink = ({ url, title }: { url: string; title?: string | null }): Link => ({ url, ...(title ? { title } : {}) });
