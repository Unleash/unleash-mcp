import type { UnleashClient } from '../../../unleash/client.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import type { ReleaseTemplateQuery } from '../inspectInput.ts';
import type { ReleaseTemplate } from '../inspectOutput.ts';
import { toTemplateTarget, toTransition } from '../shared/milestone.ts';

/**
 * Describes a release template, global or in a project, so an agent can pick one for release or reuse its audiences.
 * The global endpoint answers project templates too, which spares the agent knowing where a search row came from.
 * Unleash sends the targets whether included or not, in one request.
 */
export const inspectReleaseTemplate = async (
  unleash: UnleashClient,
  { id, include = [] }: ReleaseTemplateQuery,
): Promise<ReleaseTemplate | Failed> => {
  const found = await unleash.GET('/api/admin/release-plan-templates/{templateId}', {
    params: { path: { templateId: id } },
  });
  if (!found.response.ok || !found.data) return toFailed(found);
  const { name, project, description, milestones = [] } = found.data;
  const withTargets = include.includes('targets');
  return {
    kind: 'release_template',
    id: found.data.id,
    name,
    ...(project ? { project } : {}),
    ...(description ? { description } : {}),
    milestones: milestones.map(({ name, transitionCondition, strategies }) => ({
      name,
      ...(transitionCondition ? { transition: toTransition(transitionCondition) } : {}),
      ...(withTargets && strategies?.length ? { targets: strategies.map(toTemplateTarget) } : {}),
    })),
  };
};
