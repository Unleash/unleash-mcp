import type { ServerContext } from '../context.js';
import type { ChangeRequestChange } from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';

const SKIP_CHANGE_REQUEST = 'SKIP_CHANGE_REQUEST';

export interface PendingApproval {
  changeRequestId: number;
  url: string;
}

/**
 * True when Unleash refused a write because the environment only takes approved changes. A token
 * missing some other permission gets a 403 too, but that one names the permission it lacks.
 */
export function refusedForApproval(error: unknown): boolean {
  return (
    error instanceof CustomError &&
    error.code === 'HTTP_403' &&
    error.message.includes(SKIP_CHANGE_REQUEST)
  );
}

/**
 * Unleash refuses an archive when any environment in the project only takes approved changes.
 * The Unleash UI then sends the archive to a production environment first, so this does the same.
 */
export async function archiveApprovalEnvironment(
  context: ServerContext,
  projectId: string,
): Promise<string | undefined> {
  const environments = await context.unleashClient.environmentsNeedingApproval(projectId);
  return (environments.find(({ type }) => type === 'production') ?? environments[0])?.environment;
}

export async function requestApproval(
  context: ServerContext,
  projectId: string,
  environment: string,
  featureName: string,
  changes: ChangeRequestChange[],
): Promise<PendingApproval> {
  const changeRequest = await context.unleashClient.addToChangeRequest(
    projectId,
    environment,
    featureName,
    changes,
  );
  // Unleash adds to the caller's open request, which may already be in review.
  if (changeRequest.state === 'Draft') {
    await context.unleashClient.submitChangeRequest(projectId, changeRequest.id);
  }
  return {
    changeRequestId: changeRequest.id,
    // The configured base URL ends in a slash when Unleash runs at the root.
    url: `${context.config.unleash.baseUrl.replace(/\/$/, '')}/projects/${encodeURIComponent(projectId)}/change-requests/${changeRequest.id}`,
  };
}

export function waitingForApprovalNote(environment: string, pending: PendingApproval): string {
  return `"${environment}" only takes approved changes, so nothing changed yet: change request ${pending.changeRequestId} is waiting for review at ${pending.url}.`;
}
