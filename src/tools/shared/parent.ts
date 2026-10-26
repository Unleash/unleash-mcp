import { z } from 'zod';

// Strict, so values sent with a parent that must be off are refused instead of dropped.
const on = z.strictObject({
  kind: z.literal('on'),
  flag: z.string(),
  values: z.array(z.string()).min(1).optional().describe('Served only where the parent serves one of these values: their names, as inspect lists them under the parent\'s targets'),
}).describe('Served only where the parent is on');

const off = z.strictObject({ kind: z.literal('off'), flag: z.string() }).describe('Served only where the parent is off');

/** The flag a flag depends on, as manage_flag takes it and inspect returns it. */
export const parent = z.discriminatedUnion('kind', [on, off]);

export type Parent = z.infer<typeof parent>;
