import diff from 'microdiff';
import type { FieldChange } from './auditOutput.ts';

// Fields that change without anyone editing them, and ids no tool takes: left out so a diff shows real changes.
const noise = new Set(['createdAt', 'lastSeenAt', 'lastSeen', 'id']);

/**
 * The fields a change edited, between an event's data before and after, as the UI's event log shows them: only what
 * changed, not both payloads. A creation lists additions and a deletion removals.
 * Arrays are compared by index, as in the UI, so a reorder shows as changes at each index.
 */
export const diffEventData = (before: unknown, after: unknown): FieldChange[] =>
  diff(asObject(before), asObject(after))
    .filter((change) => !change.path.some((key) => typeof key === 'string' && noise.has(key)))
    // An empty value added or removed, such as a creation's title: null, says nothing was set.
    .filter((change) => !(change.type === 'CREATE' && isEmpty(change.value)) && !(change.type === 'REMOVE' && isEmpty(change.oldValue)))
    .map((change) => ({
      path: toPath(change.path),
      ...('oldValue' in change ? { before: change.oldValue } : {}),
      ...('value' in change ? { after: change.value } : {}),
    }));

// Unleash types event data loosely: a missing side is empty, and a value that is not an object is diffed whole, as value.
const asObject = (value: unknown): object =>
  value === undefined || value === null ? {} : typeof value === 'object' ? value : { value };

const isEmpty = (value: unknown): boolean =>
  value === null || (Array.isArray(value) ? value.length === 0 : typeof value === 'object' && Object.keys(value).length === 0);

// As a person writes it: constraints[0].values[1].
const toPath = (keys: (string | number)[]): string =>
  keys.map((key, i) => (typeof key === 'number' ? `[${key}]` : i === 0 ? key : `.${key}`)).join('');
