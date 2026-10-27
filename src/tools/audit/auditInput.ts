import { z } from 'zod';

export const auditInput = {
  flag: z.string().describe('Flag name, as a flags search returns it; archived and deleted flags keep their history'),
  offset: z.number().int().min(0).default(0).describe('Changes to skip; page with offset and limit until total is reached'),
  limit: z.number().int().min(1).max(50).default(20).describe('Changes per page'),
};

export type AuditInput = z.infer<z.ZodObject<typeof auditInput>>;
