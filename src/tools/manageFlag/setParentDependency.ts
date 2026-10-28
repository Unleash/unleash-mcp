import type { UnleashClient } from '../../unleash/client.ts';
import { type ChangeRequestReader, requestChanges, routeToProject } from '../shared/changeRequest.ts';
import { toFailed } from '../shared/failed.ts';
import type { Parent } from '../shared/parent.ts';
import type { SetParentDependency } from './manageFlagInput.ts';
import type { Outcome, PendingChange } from './manageFlagOutput.ts';

const dependencies = '/api/admin/projects/{projectId}/features/{child}/dependencies';

// Unleash refuses a parent change when any of the project's environments needs approval, so there it waits in a change request.
export const setParentDependency = async (
  unleash: UnleashClient,
  environmentsOf: ChangeRequestReader,
  { project, flag, parent }: SetParentDependency,
): Promise<Outcome | PendingChange> => {
  const route = await routeToProject(environmentsOf, project);
  if (route.kind === 'failed') return route;
  if (route.kind === 'changeRequest') {
    const change =
      parent.kind !== 'none'
        ? { feature: flag, action: 'addDependency' as const, payload: toDependency(parent) }
        : { feature: flag, action: 'deleteDependency' as const };
    const requested = await requestChanges(unleash, route, change);
    if (requested.kind === 'failed') return requested;
    return { kind: 'pending_change_request', changeRequest: requested.changeRequest };
  }
  const path = { projectId: project, child: flag };
  const written =
    parent.kind !== 'none'
      ? await unleash.POST(dependencies, { params: { path }, body: toDependency(parent) })
      : await unleash.DELETE(dependencies, { params: { path } });
  if (!written.response.ok) return toFailed(written);
  return { kind: 'applied' };
};

const toDependency = (parent: Parent) =>
  parent.kind === 'off'
    ? { feature: parent.flag, enabled: false }
    : { feature: parent.flag, enabled: true, ...(parent.values ? { variants: parent.values } : {}) };
