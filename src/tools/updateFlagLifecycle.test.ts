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
  children: string[] = [],
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
    getFeature: vi.fn(async () => ({ name: featureName, children })),
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
      sent: { status: 'kept', statusValue: 'variant-b' },
      summary: 'Stage changed from live to completed (kept).',
    });
    const help = helpOf(result.structuredContent);
    expect(help).toContainEqual(expect.stringContaining('statusValue "variant-b"'));
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
      `If code still references it, remove it: call cleanup_flag with { flagName: "${featureName}" }`,
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
      summary: 'No change. Stage: completed (kept). Stale: no.',
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
    expect(client.findFeatureProject).not.toHaveBeenCalled();
    expect(client.completeFeature).not.toHaveBeenCalled();
  });

  it('names the flags that block archiving', async () => {
    const { context, client } = createContext(
      transition({ presence: 'active' }, { presence: 'archived' }),
      { parentsWithChildFeatures: [featureName], hasDeletedDependencies: true },
      ['checkout-child', 'checkout-banner'],
    );

    const result = await updateFlagLifecycle(context, { featureName, action: 'archive' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: 'ARCHIVE_WOULD_ORPHAN_CHILDREN',
        message: `"${featureName}" was not archived. Flags that depend on it: checkout-child, checkout-banner.`,
      },
    });
    expect(client.archiveFeature).not.toHaveBeenCalled();
  });

  it.each([
    ['mark_stale', false, true, 'Marked stale. Stage unchanged: live.'],
    ['unmark_stale', true, false, 'Cleared stale marker. Stage unchanged: live.'],
  ] as const)('keeps the stale marker apart from the stage on %s', async (action, staleBefore, staleAfter, summary) => {
    const { context } = createContext(
      transition(
        { presence: 'active', stage: 'live', stale: staleBefore },
        { presence: 'active', stage: 'live', stale: staleAfter },
      ),
    );

    const result = await updateFlagLifecycle(context, { featureName, action });

    expect(result.structuredContent).toMatchObject({ summary });
  });

  it('does not echo what was sent for actions other than complete', async () => {
    const { context } = createContext(
      transition({ presence: 'active', stage: 'live' }, { presence: 'archived' }),
    );

    const result = await updateFlagLifecycle(context, { featureName, action: 'archive' });

    expect(result.structuredContent).not.toHaveProperty('sent');
  });
});
