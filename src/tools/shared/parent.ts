import { z } from 'zod';

const enabled = z
  .strictObject({
    state: z.literal('enabled'),
    flag: z.string(),
    values: z
      .array(z.string())
      .min(1)
      .optional()
      .describe(
        "Served only where the parent serves one of these values: their names, as inspect lists them under the parent's targets",
      ),
  })
  .describe('Served only where the parent is enabled');

const disabled = z
  .strictObject({ state: z.literal('disabled'), flag: z.string() })
  .describe('Served only where the parent is disabled');

/** The flag a flag depends on, as manage_flag takes it and inspect returns it. */
export const parent = z.discriminatedUnion('state', [enabled, disabled]);

export type Parent = z.infer<typeof parent>;
