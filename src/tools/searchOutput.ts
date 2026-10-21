import { z } from 'zod';

export const searchOutput = {};

export type SearchOutput = z.infer<z.ZodObject<typeof searchOutput>>;
