import type { ServerContext } from '../context.js';
import type { ChangeRequestChange, ChangeRequestRef } from '../unleash/client.js';

export interface ChangeRequestLink {
  id: number;
  url: string;
  state: ChangeRequestRef['state'];
}

/** The reply for a change that went into a change request instead of being saved. */
export interface PendingApproval<Requested> {
  outcome: 'pendingApproval';
  requested: Requested;
  changeRequest: ChangeRequestLink;
  notes: string[];
}

/** The environment's name as Unleash spells it, when it only takes approved changes. */
export const takesOnlyApproved = (
  environments: Array<{ environment: string }>,
  name: string,
): string | undefined =>
  environments.find(({ environment }) => environment.toLowerCase() === name.toLowerCase())
    ?.environment;

/**
 * Adds the changes to the caller's open change request for the environment and sends it for review,
 * unless it already held other changes. Those stay in it, and the caller submits it when it's ready.
 */
export async function requestChange(
  context: ServerContext,
  projectId: string,
  environment: string,
  featureName: string,
  changes: ChangeRequestChange[],
): Promise<{ changeRequest: ChangeRequestLink; notes: string[] }> {
  const { unleashClient } = context;
  const existing = (await unleashClient.openChangeRequests(projectId)).find(
    (open) => open.environment === environment,
  );
  const added = await unleashClient.addToChangeRequest(
    projectId,
    environment,
    featureName,
    changes,
  );
  const url = `${context.config.unleash.baseUrl.replace(/\/$/, '')}/projects/${encodeURIComponent(projectId)}/change-requests/${added.id}`;

  if (existing && existing.changeCount > 0) {
    const tail =
      existing.state === 'Draft'
        ? `It is not submitted: submit it in Unleash when it's ready (${url}).`
        : `It was ${existing.state === 'Approved' ? 'approved' : 'in review'}, so adding to it reset its approvals and it needs review again (${url}).`;
    return {
      changeRequest: { id: added.id, url, state: added.state },
      notes: [
        `Added to your open change request ${added.id}, which also holds other changes. ${tail}`,
      ],
    };
  }

  await unleashClient.submitChangeRequest(projectId, added.id);
  return {
    changeRequest: { id: added.id, url, state: 'In review' },
    notes: [
      `"${environment}" only takes approved changes, so nothing changed yet: change request ${added.id} is waiting for review at ${url}.`,
    ],
  };
}
