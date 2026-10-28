import { z } from 'zod';

/** A value a context field allows, as configure takes it and inspect returns it. */
export const legalValue = z.strictObject({
  value: z.string().describe('e.g. gold'),
  description: z.string().optional().describe('What the value means, shown next to it when picking values'),
});
