import type { UnleashClient } from '../../unleash/client.ts';
import type { Archive } from './manageFlagInput.ts';
import type { Outcome, PendingChange } from './manageFlagOutput.ts';
import { type ChangeRequestReader, requestChanges, routeToProject } from '../shared/changeRequest.ts';
import { toFailed } from '../shared/failed.ts';

/**
 * Archives a flag, answering Unleash's refusal (e.g. no such flag) as `failed`. Unleash refuses to archive a flag
 * when any of the project's environments needs approval, so there it waits in a change request.
 */
export const archiveFlag = async (unleash: UnleashClient, environmentsOf: ChangeRequestReader, { project, flag }: Archive): Promise<Outcome | PendingChange> => {
  const route = await routeToProject(environmentsOf, project);
  if (route.kind === 'failed') return route;
  if (route.kind === 'changeRequest') {
    const requested = await requestChanges(unleash, route, { feature: flag, action: 'archiveFeature' });
    if (requested.kind === 'failed') return requested;
    return { kind: 'pending_change_request', changeRequest: requested.changeRequest };
  }
  const archived = await unleash.DELETE('/api/admin/projects/{projectId}/features/{featureName}', { params: { path: { projectId: project, featureName: flag } } });
  if (!archived.response.ok) return toFailed(archived);
  return { kind: 'applied' };
};
