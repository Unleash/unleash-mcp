import type { ServerContext } from '../context.js';
import type {
  ChangeRequestChange,
  ChangeRequestRef,
  FeatureEnvironment,
  FeatureStrategy,
  OpenChangeRequest,
  UserPermission,
  WaitingChange,
} from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';

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

/** The caller's open change request for an environment, and the flag's changes waiting in it. */
export interface Waiting {
  changeRequest?: OpenChangeRequest;
  changes: WaitingChange[];
}

/** A strategy waiting in a change request to be added. Changing it edits that change. */
export interface WaitingStrategy extends FeatureStrategy {
  waitingChangeId: number;
}

export const isWaitingStrategy = (strategy: FeatureStrategy): strategy is WaitingStrategy =>
  'waitingChangeId' in strategy;

// Unleash's own check: ADMIN passes everything, and a permission without a project or
// environment applies to all of them.
const canSkipChangeRequests = (
  permissions: UserPermission[],
  projectId: string,
  environment: string,
): boolean =>
  permissions.some(
    (granted) =>
      (granted.permission === 'ADMIN' || granted.permission === 'SKIP_CHANGE_REQUEST') &&
      (!granted.project || granted.project === projectId || granted.project === '*') &&
      (!granted.environment || granted.environment === environment || granted.environment === '*'),
  );

/**
 * The environments where the caller's writes need approval: change requests are on there, and,
 * as in the Unleash UI, the caller has neither ADMIN nor SKIP_CHANGE_REQUEST.
 */
export async function approvalEnvironments(
  context: ServerContext,
  projectId: string,
): Promise<string[]> {
  const configured = await context.unleashClient.changeRequestEnvironments(projectId);
  if (configured.length === 0) return [];
  const permissions = await context.unleashClient.getOwnPermissions();
  return configured
    .map(({ environment }) => environment)
    .filter((environment) => !canSkipChangeRequests(permissions, projectId, environment));
}

/** The environment's name as Unleash spells it, when it is one of them. */
export const findApprovalEnvironment = (environments: string[], name: string): string | undefined =>
  environments.find((environment) => environment.toLowerCase() === name.toLowerCase());

export function findWaiting(
  open: OpenChangeRequest[],
  environment: string,
  featureName: string,
): Waiting {
  const changeRequest = open.find((request) => request.environment === environment);
  const changes = changeRequest?.features.find(({ name }) => name === featureName)?.changes ?? [];
  return { changeRequest, changes };
}

/** The environment as it will be once the waiting changes are applied, which follow-ups build on. */
export function withWaitingChanges(
  environment: FeatureEnvironment,
  changes: WaitingChange[],
): FeatureEnvironment {
  let { enabled, strategies = [] } = environment;
  for (const change of changes) {
    if (change.action === 'updateEnabled') {
      enabled = change.payload.enabled;
      if (enabled && change.payload.shouldActivateDisabledStrategies) {
        strategies = strategies.map((strategy) => ({ ...strategy, disabled: false }));
      }
    }
    if (change.action === 'addStrategy') {
      const waiting: WaitingStrategy = {
        ...change.payload,
        id: `waiting-${change.id}`,
        waitingChangeId: change.id,
      };
      strategies = [...strategies, waiting];
    }
    if (change.action === 'updateStrategy') {
      const { payload } = change;
      strategies = strategies.map((strategy) => (strategy.id === payload.id ? payload : strategy));
    }
    if (change.action === 'deleteStrategy') {
      const { payload } = change;
      strategies = strategies.filter((strategy) => strategy.id !== payload.id);
    }
  }
  return { ...environment, enabled, strategies };
}

export function changeRequestLink(
  context: ServerContext,
  projectId: string,
  { id, state }: ChangeRequestRef,
): ChangeRequestLink {
  const baseUrl = context.config.unleash.baseUrl.replace(/\/$/, '');
  return {
    id,
    url: `${baseUrl}/projects/${encodeURIComponent(projectId)}/change-requests/${id}`,
    state,
  };
}

/** The reply when the open change request already makes the requested change. */
export function alreadyWaiting<Requested>(
  context: ServerContext,
  projectId: string,
  changeRequest: ChangeRequestRef,
  requested: Requested,
  change: string,
): PendingApproval<Requested> {
  const link = changeRequestLink(context, projectId, changeRequest);
  return {
    outcome: 'pendingApproval',
    requested,
    changeRequest: link,
    notes: [`Change request ${link.id} already ${change}, so nothing was added (${link.url}).`],
  };
}

/**
 * Puts the changes into the caller's open change request for the environment, replacing the
 * waiting change in `edit`, and sends it for review only when this call created it.
 */
export async function requestChange(
  context: ServerContext,
  projectId: string,
  environment: string,
  featureName: string,
  waiting: Waiting,
  changes: ChangeRequestChange[],
  edit?: { changeId: number; change: ChangeRequestChange },
): Promise<{ changeRequest: ChangeRequestLink; notes: string[] }> {
  const { unleashClient } = context;
  const open = waiting.changeRequest;
  let saved: ChangeRequestRef | undefined = open;
  if (open && edit) {
    saved = await unleashClient.editChange(
      projectId,
      open.id,
      edit.changeId,
      featureName,
      edit.change,
    );
  }
  if (changes.length > 0 || !saved) {
    saved = await unleashClient.addToChangeRequest(projectId, environment, featureName, changes);
  }
  const link = changeRequestLink(context, projectId, saved);

  // A draft that was already open may hold the user's own unfinished changes.
  if (saved.state === 'Draft' && !open) {
    try {
      await unleashClient.submitChangeRequest(projectId, saved.id);
    } catch (error) {
      if (!(error instanceof CustomError)) throw error;
      const draft = `The change is in change request ${saved.id}, which is still a draft. Submit it in Unleash (${link.url}).`;
      throw new CustomError(
        error.code,
        error.message,
        error.hint ? `${error.hint} ${draft}` : draft,
      );
    }
    return {
      changeRequest: { ...link, state: 'In review' },
      notes: [
        `"${environment}" needs approval for your changes, so nothing changed yet: change request ${saved.id} is waiting for review at ${link.url}.`,
      ],
    };
  }
  if (saved.state === 'Draft') {
    return {
      changeRequest: link,
      notes: [
        `Added to your draft change request ${saved.id}. It is not submitted: submit it in Unleash when it's ready (${link.url}).`,
      ],
    };
  }
  return {
    changeRequest: link,
    notes: [
      `Added to your change request ${saved.id}, which was ${open?.state === 'Approved' ? 'approved' : 'in review'}. Adding to it reset its approvals, so it needs review again (${link.url}).`,
    ],
  };
}
