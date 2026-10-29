import type { Clock } from './clock.ts';

/** A clock stopped at the given instant. */
export const fixedClock =
  (at: string): Clock =>
  () =>
    new Date(at);
