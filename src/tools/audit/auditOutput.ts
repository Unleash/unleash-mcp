import { z } from 'zod';
import { failed, type Failed } from '../shared/failed.ts';

const change = z.object({
  id: z.number().int().describe('Unleash event id'),
  groupId: z.string().optional().describe('Shared by the changes made together, such as those of one applied change request'),
  changedAt: z.string().describe('ISO timestamp'),
  type: z.string().describe('What happened: the Unleash event type, such as feature-environment-enabled'),
  changedBy: z.string().describe('Who made the change: a user, or the name of the API token'),
  ip: z.string().optional().describe('IP address the change came from; Enterprise only'),
  project: z.string().optional(),
  flag: z.string().optional(),
  environment: z.string().optional().describe('Set when the change was made in one environment'),
});

const changes = z.object({
  kind: z.literal('changes'),
  from: z.string().describe('First day searched, YYYY-MM-DD in UTC'),
  to: z.string().describe('Last day searched, YYYY-MM-DD in UTC, included'),
  total: z.number().int().describe('Changes in all pages'),
  changes: z.array(change).describe('Most recent first'),
});

const result = z.discriminatedUnion('kind', [changes, failed]);

export const auditOutput = { result };

export type Change = z.infer<typeof change>;
export type Changes = z.infer<typeof changes>;
export type AuditResult = Changes | Failed;
