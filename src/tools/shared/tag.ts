import { z } from 'zod';

export const tag = z.object({ type: z.string(), value: z.string() });

export type Tag = z.infer<typeof tag>;
