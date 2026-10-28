import { z } from 'zod';

export const link = z.strictObject({ url: z.string(), title: z.string().optional() });

export type Link = z.infer<typeof link>;
