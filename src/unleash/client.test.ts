import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomError } from '../utils/errors.js';
import { UnleashClient } from './client.js';

describe('UnleashClient User-Agent', () => {
  function getUserAgent(client: UnleashClient): string {
    const headers = (
      client as unknown as { buildRequestHeaders: () => Record<string, string> }
    ).buildRequestHeaders();
    return headers['User-Agent'];
  }

  it('emits base User-Agent when no getClientInfo is provided', () => {
    const client = new UnleashClient('https://example.com', {}, true);
    expect(getUserAgent(client)).toMatch(/^unleash-mcp\/[\w.-]+ \(MCP Server\)$/);
  });

  it('emits base User-Agent when getClientInfo returns undefined', () => {
    const client = new UnleashClient('https://example.com', {}, true, () => undefined);
    expect(getUserAgent(client)).toMatch(/^unleash-mcp\/[\w.-]+ \(MCP Server\)$/);
  });

  it('emits enriched User-Agent when getClientInfo returns valid info', () => {
    const client = new UnleashClient('https://example.com', {}, true, () => ({
      name: 'claude-code',
      version: '1.2.3',
    }));
    expect(getUserAgent(client)).toMatch(
      /^unleash-mcp\/[\w.-]+ \(MCP Server; client=claude-code\/1\.2\.3\)$/,
    );
  });

  it('emits base User-Agent when attribution is disabled', () => {
    const client = new UnleashClient(
      'https://example.com',
      {},
      true,
      () => ({
        name: 'claude-code',
        version: '1.2.3',
      }),
      false,
    );
    expect(getUserAgent(client)).toMatch(/^unleash-mcp\/[\w.-]+ \(MCP Server\)$/);
  });

  it('falls back to base User-Agent when getClientInfo throws', () => {
    const client = new UnleashClient('https://example.com', {}, true, () => {
      throw new Error('boom');
    });
    expect(getUserAgent(client)).toMatch(/^unleash-mcp\/[\w.-]+ \(MCP Server\)$/);
  });

  it('sanitizes special chars in clientInfo before composing', () => {
    const client = new UnleashClient('https://example.com', {}, true, () => ({
      name: 'evil(client)',
      version: '1;0',
    }));
    expect(getUserAgent(client)).toMatch(
      /^unleash-mcp\/[\w.-]+ \(MCP Server; client=evilclient\/10\)$/,
    );
  });
});

describe('UnleashClient lifecycle', () => {
  const base = 'https://unleash.test';
  const featureUrl = `${base}/api/admin/projects/p1/features/my-flag`;
  const archivedSearchUrl = `${base}/api/admin/search/features?project=IS%3Ap1&archived=IS%3Atrue&query=my-flag`;
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: UnleashClient;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const empty = (status = 200) => new Response(null, { status });
  const notFound = () => json({ message: 'Not found' }, 404);
  const active = (lifecycle: { stage: string; status?: string }, stale = false) =>
    json({
      name: 'my-flag',
      archived: false,
      stale,
      lifecycle: { ...lifecycle, enteredStageAt: 'x' },
    });

  function calls() {
    return fetchMock.mock.calls.map(([url, init]) => ({
      url: url as string,
      method: (init as RequestInit).method,
      body: (init as RequestInit).body,
    }));
  }

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new UnleashClient(base, { Authorization: 'token' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches lifecycle history', async () => {
    const history = [{ stage: 'initial', enteredStageAt: 'x' }];
    fetchMock.mockResolvedValueOnce(json(history));

    await expect(client.getFeatureLifecycle('p1', 'my-flag')).resolves.toEqual(history);
    expect(calls()).toEqual([{ url: `${featureUrl}/lifecycle`, method: 'GET', body: undefined }]);
  });

  it('validates archiving', async () => {
    const report = { parentsWithChildFeatures: ['my-flag'], hasDeletedDependencies: true };
    fetchMock.mockResolvedValueOnce(json(report));

    await expect(client.validateArchiveFeatures('p1', ['my-flag'])).resolves.toEqual(report);
    expect(calls()).toEqual([
      {
        url: `${base}/api/admin/projects/p1/archive/validate`,
        method: 'POST',
        body: JSON.stringify({ features: ['my-flag'] }),
      },
    ]);
  });

  it('reports a change when completing a live flag', async () => {
    fetchMock
      .mockResolvedValueOnce(active({ stage: 'live' }))
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(active({ stage: 'completed', status: 'kept' }));

    const result = await client.completeFeature('p1', 'my-flag', { status: 'kept' });

    expect(result).toEqual({
      changed: true,
      changes: [
        { path: ['stage'], before: 'live', after: 'completed' },
        { path: ['status'], before: undefined, after: 'kept' },
      ],
      before: { presence: 'active', stage: 'live', stale: false },
      after: { presence: 'active', stage: 'completed', status: 'kept', stale: false },
    });
    expect(calls()[1]).toEqual({
      url: `${featureUrl}/lifecycle/complete`,
      method: 'POST',
      body: JSON.stringify({ status: 'kept' }),
    });
  });

  it('reports no change when completing an already completed flag', async () => {
    fetchMock
      .mockResolvedValueOnce(active({ stage: 'completed', status: 'kept' }))
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(active({ stage: 'completed', status: 'kept' }));

    const result = await client.completeFeature('p1', 'my-flag', { status: 'kept' });

    expect(result.changed).toBe(false);
    expect(result.changes).toEqual([]);
  });

  it('uncompletes a flag', async () => {
    fetchMock
      .mockResolvedValueOnce(active({ stage: 'completed', status: 'kept' }))
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(active({ stage: 'live' }));

    const result = await client.uncompleteFeature('p1', 'my-flag');

    expect(result.changes).toEqual([
      { path: ['stage'], before: 'completed', after: 'live' },
      { path: ['status'], before: 'kept', after: undefined },
    ]);
    expect(calls()[1]).toMatchObject({ url: `${featureUrl}/lifecycle/uncomplete`, method: 'POST' });
  });

  it('finds an archived flag through search after archiving', async () => {
    fetchMock
      .mockResolvedValueOnce(active({ stage: 'live' }))
      .mockResolvedValueOnce(empty(202))
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(json({ features: [{ name: 'my-flag', stale: false }] }));

    const result = await client.archiveFeature('p1', 'my-flag');

    expect(result.changed).toBe(true);
    expect(result.after).toEqual({ presence: 'archived', stage: 'archived', stale: false });
    expect(calls()[1]).toMatchObject({ url: featureUrl, method: 'DELETE' });
    expect(calls()[3].url).toBe(archivedSearchUrl);
  });

  it('ignores search results that only partly match the name', async () => {
    fetchMock
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(json({ features: [{ name: 'my-flag-2' }] }))
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(json({ features: [] }));

    const result = await client.reviveFeature('p1', 'my-flag');

    expect(result).toEqual({
      changed: false,
      changes: [],
      before: { presence: 'missing' },
      after: { presence: 'missing' },
    });
    expect(calls()[2]).toMatchObject({
      url: `${base}/api/admin/archive/revive/my-flag`,
      method: 'POST',
    });
  });

  it('reports no change when deleting an active flag', async () => {
    fetchMock
      .mockResolvedValueOnce(active({ stage: 'live' }))
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(active({ stage: 'live' }));

    const result = await client.deleteArchivedFeature('p1', 'my-flag');

    expect(result.changed).toBe(false);
    expect(result.after.presence).toBe('active');
    expect(calls()[1]).toMatchObject({
      url: `${base}/api/admin/archive/my-flag`,
      method: 'DELETE',
    });
  });

  it('reports the flag missing after deleting an archived flag', async () => {
    fetchMock
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(json({ features: [{ name: 'my-flag', stale: false }] }))
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(json({ features: [] }));

    const result = await client.deleteArchivedFeature('p1', 'my-flag');

    expect(result.changed).toBe(true);
    expect(result.before.presence).toBe('archived');
    expect(result.after).toEqual({ presence: 'missing' });
  });

  it('marks a flag stale through the batch endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(active({ stage: 'live' }, false))
      .mockResolvedValueOnce(empty(202))
      .mockResolvedValueOnce(active({ stage: 'live' }, true));

    const result = await client.setFeatureStale('p1', 'my-flag', true);

    expect(result.changed).toBe(true);
    expect(calls()[1]).toEqual({
      url: `${base}/api/admin/projects/p1/stale`,
      method: 'POST',
      body: JSON.stringify({ features: ['my-flag'], stale: true }),
    });
  });

  it('throws a CustomError when the mutation fails', async () => {
    fetchMock
      .mockResolvedValueOnce(active({ stage: 'live' }))
      .mockResolvedValueOnce(json({ message: 'Forbidden' }, 403));

    const error = await client.archiveFeature('p1', 'my-flag').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CustomError);
    expect(error).toMatchObject({ code: 'HTTP_403', message: 'Forbidden' });
  });

  it('does not call the API in dry-run mode', async () => {
    const dryRunClient = new UnleashClient(base, {}, true);

    const result = await dryRunClient.archiveFeature('p1', 'my-flag');

    expect(result.changed).toBe(true);
    expect(result.after.presence).toBe('archived');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
