import { z } from 'zod';

// As the Unleash UI names the flag states on its stale filter; the API spells potentially stale with a dash.
export const staleness = z.enum(['active', 'stale', 'potentially_stale']);

/** Whether a flag is overdue: marked stale by a person, or potentially stale as Unleash computes it from the expected lifetime. */
export type Staleness = z.infer<typeof staleness>;
export type UnleashStaleness = 'active' | 'stale' | 'potentially-stale';

export const toUnleashStaleness = (value: Staleness): UnleashStaleness =>
  value === 'potentially_stale' ? 'potentially-stale' : value;

/** What a person can mark: Unleash computes potentially stale on its own. */
export const markedStaleness = staleness.exclude(['potentially_stale']);

// The rule Unleash's own job applies: past the expected lifetime and not marked stale. A permanent flag has no end date.
export const toStaleness = (
  stale: boolean | undefined,
  expectedLifetimeEndsAt: string | undefined,
  now: Date,
): Staleness =>
  stale ? 'stale' : expectedLifetimeEndsAt && new Date(expectedLifetimeEndsAt) < now ? 'potentially_stale' : 'active';
