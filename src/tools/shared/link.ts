import { z } from 'zod';

export const link = z.object({ url: z.string(), title: z.string().optional() });

export type Link = z.infer<typeof link>;
