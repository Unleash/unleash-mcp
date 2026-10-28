import type { UnleashClient } from '../../../unleash/client.ts';
import { type Failed, toFailed } from '../failed.ts';
import type { EnvironmentPath, MilestoneRef } from './plan.ts';

const start = '/api/admin/projects/{project}/features/{featureName}/environments/{environment}/release-plans/{planId}/milestones/{milestoneId}/start';

/** A release plan milestone started in an environment: the plan and the milestone now served. */
export type StartedMilestone = { kind: 'started'; releasePlan: { id: string; plan: string; milestone: string } };

/** Starts a milestone of the environment's release plan, replacing the milestone being served. */
export const startMilestone = async (unleash: UnleashClient, { projectId, featureName, environment }: EnvironmentPath, { planId, milestoneId }: MilestoneRef): Promise<StartedMilestone | Failed> => {
  // Unleash refuses the call without a JSON content type, which only a body sets. The spec declares none.
  const started = await unleash.POST(start, { params: { path: { project: projectId, featureName, environment, planId, milestoneId } }, body: {} as never });
  if (!started.response.ok || !started.data) return toFailed(started);
  const { name, milestones, activeMilestoneId } = started.data;
  const milestone = milestones.find((m) => m.id === activeMilestoneId)?.name ?? '';
  return { kind: 'started', releasePlan: { id: planId, plan: name, milestone } };
};
