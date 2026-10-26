import { z } from 'zod';

export const flagState = z.enum(['on', 'off']);

/** Whether a flag's environment serves the feature to its targets. */
export type FlagState = z.infer<typeof flagState>;

export const toFlagState = (enabled: boolean): FlagState => (enabled ? 'on' : 'off');
