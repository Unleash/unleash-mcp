import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import type { FeatureLifecycleSnapshot, LifecycleTransitionResult } from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { createFlagLinks } from '../utils/streaming.js';
import { jsonResult } from '../utils/toolResult.js';
import {
  alreadyWaiting,
  findWaiting,
  type PendingApproval,
  requestChange,
} from './changeRequests.js';

const ACTIONS = [
  'complete',
  'uncomplete',
  'archive',
  'revive',
  'mark_stale',
  'unmark_stale',
] as const;
type LifecycleAction = (typeof ACTIONS)[number];

const updateFlagLifecycleSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Project ID where the feature flag resides. Omit it to find it from the flag name.'),
  featureName: z.string().min(1).describe('Feature flag name'),
  action: z.enum(ACTIONS).describe('Lifecycle change to apply'),
  status: z
    .enum(['kept', 'discarded'])
    .optional()
    .describe(
      'Required when action is "complete". "kept": the feature stays in the product. "discarded": the feature was removed.',
    ),
  statusValue: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional detail for "complete", e.g. the variant that was kept. Unleash stores it but does not return it, so the result echoes it under "sent".',
    ),
});

type UpdateFlagLifecycleInput = z.infer<typeof updateFlagLifecycleSchema>;

export async function updateFlagLifecycle(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: UpdateFlagLifecycleInput = updateFlagLifecycleSchema.parse(args);
    ensureStatusWhenCompleting(input);

    const projectId = await findProjectId(context, input);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Applying "${input.action}" to "${input.featureName}"...`,
    );

    if (input.action === 'archive') {
      // Like the Unleash UI: while any environment has change requests on, archiving goes through
      // one, in a production environment first, even for admins.
      const configured = await context.unleashClient.changeRequestEnvironments(projectId);
      const environment = (configured.find(({ type }) => type === 'production') ?? configured[0])
        ?.environment;
      if (environment) return await archiveThroughApproval(context, projectId, input, environment);
    }
    const result = await applyAction(context, projectId, input);

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Applied "${input.action}" to "${input.featureName}"`,
    );

    return savedReply(context, projectId, input, result);
  } catch (error) {
    return handleToolError(context, error, 'update_flag_lifecycle');
  }
}

function savedReply(
  context: ServerContext,
  projectId: string,
  input: UpdateFlagLifecycleInput,
  result: LifecycleTransitionResult,
): CallToolResult {
  const { url, resourceUri } = createFlagLinks(
    context.config.unleash.baseUrl,
    projectId,
    input.featureName,
  );

  return jsonResult({
    outcome: 'saved',
    success: true,
    dryRun: context.config.server.dryRun,
    projectId,
    featureName: input.featureName,
    action: input.action,
    changed: result.changed,
    before: result.before,
    after: result.after,
    ...sentDetails(input),
    summary: summarize(result),
    help: buildHelp(projectId, input, result),
    links: { ui: url, resourceUri },
  });
}

async function archiveThroughApproval(
  context: ServerContext,
  projectId: string,
  input: UpdateFlagLifecycleInput,
  environment: string,
): Promise<CallToolResult> {
  const { featureName } = input;
  const current = await context.unleashClient.getLifecycleSnapshot(projectId, featureName);
  if (current.presence === 'missing') {
    throw new CustomError(
      'FLAG_NOT_FOUND',
      `No flag named "${featureName}" exists in project "${projectId}", active or archived.`,
      'Search for the flag by name to find its exact name and project.',
    );
  }
  if (current.presence === 'archived') {
    return savedReply(context, projectId, input, {
      changed: false,
      changes: [],
      before: current,
      after: current,
    });
  }

  const { url, resourceUri } = createFlagLinks(
    context.config.unleash.baseUrl,
    projectId,
    featureName,
  );
  const reply = {
    success: true,
    projectId,
    featureName,
    action: input.action,
    links: { ui: url, resourceUri },
  };
  const open = await context.unleashClient.openChangeRequests(projectId);
  const waiting = findWaiting(open, environment, featureName);
  if (waiting.changeRequest && waiting.changes.some(({ action }) => action === 'archiveFeature')) {
    const pending = alreadyWaiting(
      context,
      projectId,
      waiting.changeRequest,
      { action: 'archive' },
      'archives it',
    );
    return jsonResult({ ...reply, ...pending });
  }

  await ensureNoOrphanedChildren(context, projectId, featureName);
  const pending: PendingApproval<{ action: 'archive' }> = {
    outcome: 'pendingApproval',
    requested: { action: 'archive' },
    ...(await requestChange(context, projectId, environment, featureName, waiting, [
      { action: 'archiveFeature' },
    ])),
  };
  return jsonResult({ ...reply, ...pending });
}

function ensureStatusWhenCompleting(input: UpdateFlagLifecycleInput): void {
  if (input.action === 'complete') {
    requireStatus(input);
  }
}

function requireStatus(input: UpdateFlagLifecycleInput): 'kept' | 'discarded' {
  if (!input.status) {
    throw new CustomError(
      'VALIDATION_ERROR',
      'status is required when action is "complete".',
      'Set status to "kept" if the feature stays in the product, or "discarded" if it was removed.',
    );
  }
  return input.status;
}

async function findProjectId(
  context: ServerContext,
  input: UpdateFlagLifecycleInput,
): Promise<string> {
  if (input.projectId) return input.projectId;

  const projectId = await context.unleashClient.findFeatureProject(input.featureName);
  if (!projectId) {
    throw new CustomError(
      'FLAG_NOT_FOUND',
      `No flag named "${input.featureName}" exists, active or archived.`,
      'Call search_flags with part of the name to find the exact flag name.',
    );
  }
  return projectId;
}

async function applyAction(
  context: ServerContext,
  projectId: string,
  input: UpdateFlagLifecycleInput,
): Promise<LifecycleTransitionResult> {
  const client = context.unleashClient;
  const { featureName } = input;

  switch (input.action) {
    case 'complete':
      return client.completeFeature(projectId, featureName, {
        status: requireStatus(input),
        statusValue: input.statusValue,
      });
    case 'uncomplete':
      return client.uncompleteFeature(projectId, featureName);
    case 'archive':
      await ensureNoOrphanedChildren(context, projectId, featureName);
      return client.archiveFeature(projectId, featureName);
    case 'revive':
      return client.reviveFeature(projectId, featureName);
    case 'mark_stale':
      return client.setFeatureStale(projectId, featureName, true);
    case 'unmark_stale':
      return client.setFeatureStale(projectId, featureName, false);
  }
}

async function ensureNoOrphanedChildren(
  context: ServerContext,
  projectId: string,
  featureName: string,
): Promise<void> {
  const validation = await context.unleashClient.validateArchiveFeatures(projectId, [featureName]);
  if (!validation.parentsWithChildFeatures.includes(featureName)) return;

  const { children = [] } = await context.unleashClient.getFeature(projectId, featureName);
  throw new CustomError(
    'ARCHIVE_WOULD_ORPHAN_CHILDREN',
    `"${featureName}" was not archived. Flags that depend on it: ${children.join(', ')}.`,
    `Archive those flags, or remove their dependency on "${featureName}", then retry.`,
  );
}

function describeStage(snapshot: FeatureLifecycleSnapshot): string {
  if (snapshot.presence !== 'active') return snapshot.presence;

  const stage = snapshot.stage ?? 'active';
  const status = snapshot.status ? ` (${snapshot.status})` : '';
  return `${stage}${status}`;
}

function summarize({ changed, before, after }: LifecycleTransitionResult): string {
  const stageBefore = describeStage(before);
  const stageAfter = describeStage(after);

  if (!changed) {
    return `No change. Stage: ${stageAfter}. Stale: ${after.stale ? 'yes' : 'no'}.`;
  }

  const sentences: string[] = [];
  if (stageBefore !== stageAfter) {
    sentences.push(`Stage changed from ${stageBefore} to ${stageAfter}.`);
  }
  if (Boolean(before.stale) !== Boolean(after.stale)) {
    sentences.push(after.stale ? 'Marked stale.' : 'Cleared stale marker.');
  }
  if (stageBefore === stageAfter) {
    sentences.push(`Stage unchanged: ${stageAfter}.`);
  }
  return sentences.join(' ');
}

function sentDetails(input: UpdateFlagLifecycleInput) {
  if (input.action !== 'complete') return {};
  return { sent: { status: input.status, statusValue: input.statusValue } };
}

function buildHelp(
  projectId: string,
  { featureName, action, statusValue }: UpdateFlagLifecycleInput,
  { changed, before, after }: LifecycleTransitionResult,
): string[] {
  const lifecycleCall = (action: LifecycleAction, extra = '') =>
    `call update_flag_lifecycle with { projectId: "${projectId}", featureName: "${featureName}", action: "${action}"${extra} }`;

  const help: string[] = [];
  if (!changed) {
    help.push('The flag was already in the requested state. Do not retry.');
  }

  if (action === 'complete' && statusValue) {
    help.push(
      `Unleash stores statusValue "${statusValue}" but does not return it, so "after" cannot show it.`,
    );
  }

  const cleanup = cleanupCall(featureName, after.status ?? before.status);
  if (after.stage === 'completed') {
    help.push(`Remove the flag from code: ${cleanup}`);
  } else if (after.stage === 'archived') {
    help.push(`If code still references it, remove it: ${cleanup}`);
  }

  if (after.presence === 'archived') {
    help.push(`To restore it: ${lifecycleCall('revive')}`);
  } else if (after.stage === 'completed') {
    help.push(`Archive it once no code references it: ${lifecycleCall('archive')}`);
    help.push(`To reopen it: ${lifecycleCall('uncomplete')}`);
  } else if (after.presence === 'active') {
    help.push(
      `When its job is done: ${lifecycleCall('complete', ', status: "kept" | "discarded"')}`,
    );
  }

  return help;
}

function cleanupCall(featureName: string, status: string | null | undefined): string {
  const preservePath = preservePathFor(status);
  const preserve = preservePath ? `, preservePath: "${preservePath}"` : '';
  return `call cleanup_flag with { flagName: "${featureName}"${preserve} }`;
}

function preservePathFor(status: string | null | undefined): 'enabled' | 'disabled' | undefined {
  if (status === 'kept') return 'enabled';
  if (status === 'discarded') return 'disabled';
  return undefined;
}

export const updateFlagLifecycleTool = {
  name: 'update_flag_lifecycle',
  title: 'Update flag lifecycle',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  description: `Move a feature flag through its lifecycle.

Actions:
- complete: mark the flag's job as done. Requires status "kept" (the feature stays) or "discarded" (the feature was removed).
- uncomplete: undo complete.
- archive: archive the flag; SDKs stop receiving it. Refused when other flags depend on it. In a project where an environment only takes approved changes, it goes into a change request instead and the result has outcome "pendingApproval" with a link to the change request; the flag stays active until it is approved and applied.
- revive: restore an archived flag.
- mark_stale / unmark_stale: set or clear the stale marker, which is independent of the stage.

Unleash sets the initial, pre-live and live stages from SDK metrics; this tool cannot set them.
Recommended order when a flag is no longer needed: complete, then cleanup_flag to remove it from code, then archive.
The result reports what changed and lists next steps in "help".

If the user had to correct the action, status or flag you chose, or tell you something this tool's output should have told you, call send_feedback with issueType "unexpected_result" and tool "update_flag_lifecycle" before replying.`,
  inputSchema: updateFlagLifecycleSchema,
  implementation: updateFlagLifecycle,
};
