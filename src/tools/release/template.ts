import type { UnleashClient } from '../../unleash/client.ts';
import { type Failed, toFailed } from '../shared/failed.ts';
import type { EnvironmentPath } from './releasePlan.ts';

const releasePlans = '/api/admin/projects/{project}/features/{featureName}/environments/{environment}/release-plans';

/** A release template applied to an environment: the plan Unleash copied from it and the milestone it started. */
export type AppliedTemplate = { kind: 'applied'; template: { id: string; plan: string; milestone: string } };

/** Applies a release template, which replaces any release plan the environment had and starts its first milestone. */
export const applyTemplate = async (unleash: UnleashClient, { projectId, featureName, environment }: EnvironmentPath, templateId: string): Promise<AppliedTemplate | Failed> => {
  const applied = await unleash.POST(releasePlans, { params: { path: { project: projectId, featureName, environment } }, body: { templateId } });
  if (!applied.response.ok || !applied.data) return toFailed(applied);
  const { name, milestones, activeMilestoneId } = applied.data;
  const milestone = milestones.find((m) => m.id === activeMilestoneId)?.name ?? '';
  return { kind: 'applied', template: { id: templateId, plan: name, milestone } };
};
