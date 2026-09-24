import { z } from 'zod';
import type { FeatureTag } from '../unleash/client.js';

export const flagTagSchema = z.object({
  type: z.string().min(1).describe('Tag type (must already exist in Unleash, e.g. "simple")'),
  value: z.string().min(1).describe('Tag value, e.g. "squad-checkout"'),
}) satisfies z.ZodType<FeatureTag>;

/** Render tags as `type:value` pairs for human-readable tool output. */
export function formatTags(tags: FeatureTag[]): string {
  return tags.map((tag) => `${tag.type}:${tag.value}`).join(', ');
}
