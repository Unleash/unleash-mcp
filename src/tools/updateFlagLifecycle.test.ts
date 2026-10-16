import { describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import { silentLogger as logger } from '../test-utils/silentLogger.js';
import type {
  FeatureLifecycleSnapshot,
  LifecycleTransitionResult,
  UnleashClient,
  ValidateArchiveResult,
} from '../unleash/client.js';
import { updateFlagLifecycle } from './updateFlagLifecycle.js';

const projectId = 'payments';
const featureName = 'new-checkout';

function transition(
  before: FeatureLifecycleSnapshot,
  after: FeatureLifecycleSnapshot,
  changed = true,
): LifecycleTransitionResult {
  return { changed, changes: [], before, after };
}

function createContext(
  result: LifecycleTransitionResult,
  validation: ValidateArchiveResult = {
    parentsWithChildFeatures: [],
    hasDeletedDependencies: false,
  },
) {
  const client = {
    findFeatureProject: vi.fn(async (name: string) =>
      name === featureName ? projectId : undefined,
    ),
    completeFeature: vi.fn(async () => result),
    uncompleteFeature: vi.fn(async () => result),
    archiveFeature: vi.fn(async () => result),
    reviveFeature: vi.fn(async () => result),
    setFeatureStale: vi.fn(async () => result),
    validateArchiveFeatures: vi.fn(async () => validation),
  };
  const context: ServerContext = {
    config: {
      unleash: {
        baseUrl: 'https://unleash.example.com',
        pat: '',
        defaultProject: 'default',
        feedbackUrl: 'https://feedback.example.com',
      },
      server: { dryRun: false, logLevel: 'info', attributionEnabled: true },
    },
    unleashClient: client as unknown as UnleashClient,
    feedbackClient: {} as ServerContext['feedbackClient'],
    feedbackConsentResolver: {} as ServerContext['feedbackConsentResolver'],
    logger,
    cache: { projects: null, featureFlags: new Map() },
    getClientInfo: () => undefined,
    askUserToChoose: async () => undefined,
    notifyProgress: async () => {},
  };
  return { context, client };
}

function helpOf(structuredContent: unknown): string[] {
  return (structuredContent as { help: string[] }).help;
}

describe('update_flag_lifecycle', () => {
  it('suggests removing the enabled path from code after completing as kept', async () => {
    const { context, client } = createContext(
      transition(
        { presence: 'active', stage: 'live', stale: false },
        { presence: 'active', stage: 'completed', status: 'kept', stale: false },
      ),
    );

    const result = await updateFlagLifecycle(context, {
      featureName,
      action: 'complete',
      status: 'kept',
      statusValue: 'variant-b',
    });

    expect(client.completeFeature).toHaveBeenCalledWith(projectId, featureName, {
      status: 'kept',
      statusValue: 'variant-b',
    });
    expect(result.structuredContent).toMatchObject({
      changed: true,
      summary: 'Changed from live to completed (kept).',
    });
    const help = helpOf(result.structuredContent);
    expect(help).toContainEqual(expect.stringContaining('preservePath: "enabled"'));
    expect(help).toContainEqual(expect.stringContaining('action: "archive"'));
    expect(help).toContainEqual(expect.stringContaining('action: "uncomplete"'));
  });

  it.each([
    ['uncomplete', 'uncompleteFeature', [projectId, featureName]],
    ['revive', 'reviveFeature', [projectId, featureName]],
    ['mark_stale', 'setFeatureStale', [projectId, featureName, true]],
    ['unmark_stale', 'setFeatureStale', [projectId, featureName, false]],
  ] as const)('applies %s through the matching API call', async (action, method, args) => {
    const { context, client } = createContext(
      transition({ presence: 'active', stage: 'live' }, { presence: 'active', stage: 'live' }),
    );

    await updateFlagLifecycle(context, { featureName, action });

    expect(client[method]).toHaveBeenCalledWith(...args);
  });

  it('suggests completing an active flag that is not completed yet', async () => {
    const { context } = createContext(
      transition(
        { presence: 'archived', stage: 'archived' },
        { presence: 'active', stage: 'initial' },
      ),
    );

    const result = await updateFlagLifecycle(context, { featureName, action: 'revive' });

    expect(helpOf(result.structuredContent)).toEqual([
      `When its job is done: call update_flag_lifecycle with { projectId: "${projectId}", featureName: "${featureName}", action: "complete", status: "kept" | "discarded" }`,
    ]);
  });

  it('suggests removing the disabled path from code after completing as discarded', async () => {
    const { context } = createContext(
      transition(
        { presence: 'active', stage: 'live', stale: false },
        { presence: 'active', stage: 'completed', status: 'discarded', stale: false },
      ),
    );

    const result = await updateFlagLifecycle(context, {
      featureName,
      action: 'complete',
      status: 'discarded',
    });

    expect(helpOf(result.structuredContent)).toContainEqual(
      expect.stringContaining('preservePath: "disabled"'),
    );
  });

  it('keeps the completion status when suggesting cleanup after archiving', async () => {
    const { context } = createContext(
      transition(
        { presence: 'active', stage: 'completed', status: 'discarded', stale: false },
        { presence: 'archived', stage: 'archived', stale: false },
      ),
    );

    const result = await updateFlagLifecycle(context, { featureName, action: 'archive' });

    const help = helpOf(result.structuredContent);
    expect(help).toContainEqual(expect.stringContaining('preservePath: "disabled"'));
    expect(help).toContainEqual(expect.stringContaining('action: "revive"'));
  });

  it('lets cleanup_flag ask for the path when the flag was archived without completing', async () => {
    const { context } = createContext(
      transition(
        { presence: 'active', stage: 'live', stale: false },
        { presence: 'archived', stage: 'archived', stale: false },
      ),
    );

    const result = await updateFlagLifecycle(context, { featureName, action: 'archive' });

    expect(helpOf(result.structuredContent)).toContainEqual(
      `Remove the flag from code: call cleanup_flag with { flagName: "${featureName}" }`,
    );
  });

  it('reports a definitive no-op when the flag is already in the requested state', async () => {
    const snapshot: FeatureLifecycleSnapshot = {
      presence: 'active',
      stage: 'completed',
      status: 'kept',
      stale: false,
    };
    const { context } = createContext(transition(snapshot, snapshot, false));

    const result = await updateFlagLifecycle(context, {
      featureName,
      action: 'complete',
      status: 'kept',
    });

    expect(result.structuredContent).toMatchObject({
      changed: false,
      summary: 'No change: the flag was already completed (kept).',
    });
    expect(helpOf(result.structuredContent)[0]).toBe(
      'The flag was already in the requested state. Do not retry.',
    );
  });

  it('uses the given project without looking it up', async () => {
    const { context, client } = createContext(
      transition({ presence: 'active', stage: 'live' }, { presence: 'archived' }),
    );

    const result = await updateFlagLifecycle(context, {
      projectId: 'checkout',
      featureName,
      action: 'archive',
    });

    expect(result.structuredContent).toMatchObject({ projectId: 'checkout' });
    expect(client.archiveFeature).toHaveBeenCalledWith('checkout', featureName);
    expect(client.findFeatureProject).not.toHaveBeenCalled();
  });

  it('reports a flag that exists in no project', async () => {
    const { context, client } = createContext(
      transition({ presence: 'active', stage: 'live' }, { presence: 'archived' }),
    );

    const result = await updateFlagLifecycle(context, {
      featureName: 'no-such-flag',
      action: 'archive',
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code: 'FLAG_NOT_FOUND' } });
    expect(client.archiveFeature).not.toHaveBeenCalled();
  });

  it('refuses to complete without a status', async () => {
    const { context, client } = createContext(
      transition({ presence: 'active' }, { presence: 'active' }),
    );

    const result = await updateFlagLifecycle(context, { featureName, action: 'complete' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(client.completeFeature).not.toHaveBeenCalled();
  });

  it('refuses to archive a flag other flags depend on', async () => {
    const { context, client } = createContext(
      transition({ presence: 'active' }, { presence: 'archived' }),
      { parentsWithChildFeatures: [featureName], hasDeletedDependencies: true },
    );

    const result = await updateFlagLifecycle(context, { featureName, action: 'archive' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: 'ARCHIVE_WOULD_ORPHAN_CHILDREN' },
    });
    expect(client.archiveFeature).not.toHaveBeenCalled();
  });

  it('mentions the stale marker in the summary', async () => {
    const { context } = createContext(
      transition(
        { presence: 'active', stage: 'live', stale: false },
        { presence: 'active', stage: 'live', stale: true },
      ),
    );

    const result = await updateFlagLifecycle(context, { featureName, action: 'mark_stale' });

    expect(result.structuredContent).toMatchObject({
      summary: 'Changed from live to live, stale.',
    });
  });
});
