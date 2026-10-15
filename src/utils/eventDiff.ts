import diff from 'microdiff';

/**
 * Structural diff of two JSON values (an event's `preData` → `data`).
 *
 * Mirrors how the Unleash UI renders an event: it receives the raw before/after
 * payloads and computes the diff itself (with a generic JSON differ). We do the
 * same here so the tool returns the change itself — the thing a human reads off
 * the audit log — rather than the lossy human-readable summary or two full blobs
 * the model would have to diff.
 *
 * The diff is delegated to `microdiff` (zero-dependency, ~1KB). Like the UI's
 * generic differ, it compares arrays by index, so a pure reorder surfaces as
 * per-index changes rather than "no change" — an accepted trade-off, not a bug.
 */

export interface FieldChange {
  /** Path segments to the changed leaf, e.g. `['constraints', 0, 'values', 1]`. */
  path: (string | number)[];
  before: unknown;
  after: unknown;
}

// Fields that change on their own without being a meaningful edit. Stripped so a
// diff shows real changes, not churn — the same noise the UI's diff ignores.
const NOISE_KEYS = new Set(['createdAt', 'lastSeenAt', 'lastSeen']);

function isNoise(path: (string | number)[]): boolean {
  return path.some((segment) => typeof segment === 'string' && NOISE_KEYS.has(segment));
}

/**
 * Returns the list of changed leaves between `before` and `after`. Added keys
 * surface as `{ before: undefined, after }`, removed keys as `{ before, after: undefined }`.
 * A create event (no `preData`) is naturally expressed by passing `{}` as `before`;
 * a delete, by passing `{}` as `after`.
 */
export function diffEventData(before: unknown, after: unknown): FieldChange[] {
  // microdiff requires objects/arrays; `?? {}` turns an absent side into a
  // create/delete expressed as additions/removals rather than a throw.
  const differences = diff((before ?? {}) as object, (after ?? {}) as object);

  return differences
    .filter((change) => !isNoise(change.path))
    .map((change) => ({
      path: change.path,
      before: 'oldValue' in change ? change.oldValue : undefined,
      after: 'value' in change ? change.value : undefined,
    }));
}
