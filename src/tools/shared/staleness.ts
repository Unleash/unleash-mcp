import { z } from 'zod';

// As the Unleash UI names the flag states on its stale filter; the API spells potentially stale with a dash.
export const staleness = z.enum(['active', 'stale', 'potentially_stale']);

/** Whether a flag is overdue: marked stale by a person, or potentially stale as Unleash computes it from the expected lifetime. */
export type Staleness = z.infer<typeof staleness>;
export type UnleashStaleness = 'active' | 'stale' | 'potentially-stale';

export const toUnleashStaleness = (value: Staleness): UnleashStaleness =>
  value === 'potentially_stale' ? 'potentially-stale' : value;
