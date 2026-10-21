import { z } from 'zod';

export const searchInput = {};

export type SearchInput = z.infer<z.ZodObject<typeof searchInput>>;
