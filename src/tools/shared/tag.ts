import { z } from 'zod';

export const tag = z.strictObject({ type: z.string(), value: z.string() });

export type Tag = z.infer<typeof tag>;
