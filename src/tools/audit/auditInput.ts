import { z } from 'zod';

// Every filter is optional: the date range alone keeps a search over all projects to a bounded slice of the event log.
export const auditInput = {
  project: z.array(z.string()).min(1).optional().describe('Project ids, as a projects search returns them; changes in any of them. Leave out projects and flags to read every project'),
  flag: z.array(z.string()).min(1).optional().describe('Flag names, as a flags search returns them; changes to any of them. Archived and deleted flags keep their history, so known names work too'),
  environment: z.array(z.string()).min(1).optional().describe('Environment names; changes made in any of them'),
  type: z.array(z.string().toLowerCase()).min(1).optional().describe('Event types, as an event types search returns them; changes of any of them. An unknown type finds nothing'),
  to: z.iso.date().optional().describe('Last day, YYYY-MM-DD in UTC, included; leave out for today'),
  days: z.number().int().min(1).max(31).default(2).describe('Days up to and including the last day, at most 31. The default, yesterday and today, covers at least the last 24 hours in any time zone'),
  offset: z.number().int().min(0).default(0).describe('Changes to skip, in pages of 25; narrow the filters rather than paging far'),
};

export type AuditInput = z.infer<z.ZodObject<typeof auditInput>>;
