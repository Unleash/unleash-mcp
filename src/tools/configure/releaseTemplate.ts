import type { components } from '../../unleash/api.d.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import { toFailed } from '../shared/failed.ts';
import { toStrategy } from '../shared/strategy.ts';
import type { CreateReleaseTemplate } from './configureInput.ts';
import type { Outcome } from './configureOutput.ts';

type Milestone = CreateReleaseTemplate['milestones'][number];

// Unleash puts the flag name in place of this when it applies the template to a flag.
const flagName = '{{featureName}}';

/** Creates a release template, global or in a project, answering with its id so the agent can refer to it. */
export const createReleaseTemplate = async (unleash: UnleashClient, { project, name, description, milestones }: CreateReleaseTemplate): Promise<Outcome> => {
  const template: components['schemas']['createReleasePlanTemplateSchema'] = { name, description, milestones: milestones.map(toMilestone) };
  // The OpenAPI spec leaves out the body of both create endpoints, so `template` carries the type check instead.
  const body = template as never;
  const created = project
    ? await unleash.POST('/api/admin/projects/{projectId}/release-templates', { params: { path: { projectId: project } }, body })
    : await unleash.POST('/api/admin/release-plan-templates', { body });
  if (!created.response.ok || !created.data) return toFailed(created);
  return { kind: 'applied', id: created.data.id };
};

const toMilestone = ({ name, targets, advance }: Milestone, sortOrder: number) => ({
  name,
  sortOrder,
  strategies: targets.map((target, i) => ({ ...toStrategy(flagName, target), sortOrder: i })),
  transitionCondition: advance && ('afterMinutes' in advance
    ? { type: 'time' as const, intervalMinutes: advance.afterMinutes }
    : { type: 'exposure' as const, minimumExposures: advance.afterExposures }),
});
