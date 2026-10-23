import { z } from 'zod';

export const flagType = z.enum(['release', 'experiment', 'operational', 'kill-switch', 'permission', 'sunset']);

export type FlagType = z.infer<typeof flagType>;
