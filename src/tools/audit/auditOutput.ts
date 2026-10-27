import { z } from 'zod';
import { type Failed, failed } from '../shared/failed.ts';

const fieldChange = z.object({
  path: z.string().describe('Where the value is, such as constraints[0].values[1]'),
  before: z.unknown().optional().describe('Left out when the value was added'),
  after: z.unknown().optional().describe('Left out when the value was removed'),
});

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
  diff: z.array(fieldChange).optional().describe('Set when diff is included: the values the change edited. A new item lists only what was set; empty values are left out'),
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
export type FieldChange = z.infer<typeof fieldChange>;
export type Changes = z.infer<typeof changes>;
export type AuditResult = Changes | Failed;
