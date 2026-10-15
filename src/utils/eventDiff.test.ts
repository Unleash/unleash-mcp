import { describe, expect, it } from 'vitest';
import { diffEventData } from './eventDiff.js';

describe('diffEventData', () => {
  it('reports a value added to a constraint list as a single changed path', () => {
    const before = { constraints: [{ contextName: 'userId', values: ['1'] }] };
    const after = { constraints: [{ contextName: 'userId', values: ['1', '2'] }] };

    const changes = diffEventData(before, after);

    expect(changes).toEqual([
      { path: ['constraints', 0, 'values', 1], before: undefined, after: '2' },
    ]);
  });

  it('reports a value removed from a constraint list as a single changed path', () => {
    const before = { constraints: [{ contextName: 'userId', values: ['1', '2'] }] };
    const after = { constraints: [{ contextName: 'userId', values: ['1'] }] };

    const changes = diffEventData(before, after);

    expect(changes).toEqual([
      { path: ['constraints', 0, 'values', 1], before: '2', after: undefined },
    ]);
  });

  it('reports a changed rollout percentage as the only change', () => {
    const before = { parameters: { rollout: '50', stickiness: 'default' } };
    const after = { parameters: { rollout: '100', stickiness: 'default' } };

    const changes = diffEventData(before, after);

    expect(changes).toEqual([{ path: ['parameters', 'rollout'], before: '50', after: '100' }]);
  });

  it('ignores noise fields that change without being a meaningful edit', () => {
    const before = { enabled: true, lastSeenAt: '2026-01-01T00:00:00Z', createdAt: '2025-01-01' };
    const after = { enabled: true, lastSeenAt: '2026-10-15T00:00:00Z', createdAt: '2025-06-01' };

    const changes = diffEventData(before, after);

    expect(changes).toEqual([]);
  });

  it('treats an absent preData as a creation, listing fields as additions', () => {
    const after = { type: 'release', enabled: false };

    const changes = diffEventData(undefined, after);

    expect(changes).toEqual([
      { path: ['type'], before: undefined, after: 'release' },
      { path: ['enabled'], before: undefined, after: false },
    ]);
  });

  it('reports a removed field with an undefined after value', () => {
    const before = { description: 'old note', enabled: true };
    const after = { enabled: true };

    const changes = diffEventData(before, after);

    expect(changes).toEqual([{ path: ['description'], before: 'old note', after: undefined }]);
  });
});
