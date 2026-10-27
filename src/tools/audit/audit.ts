import type { components } from '../../unleash/api.d.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import type { AuditInput } from './auditInput.ts';
import type { AuditResult, Change } from './auditOutput.ts';
import { toFailed } from '../shared/failed.ts';

type UnleashEvent = components['schemas']['eventSchema'];

const pageSize = 25;

// Unleash pages and filters on its side; a date range always narrows the search, so it reads a bounded slice of the event log.
export const createAudit =
  (unleash: UnleashClient, now: () => Date) =>
    async ({ project, flag, environment, to, days, offset }: AuditInput): Promise<AuditResult> => {
      const last = to ?? toUtcDate(now());
      const first = daysBefore(last, days - 1);
      const found = await unleash.GET('/api/admin/search/events', {
        params: {
          query: {
            ...(project ? { project: `IS_ANY_OF:${project.join(',')}` } : {}),
            ...(flag ? { feature: `IS_ANY_OF:${flag.join(',')}` } : {}),
            ...(environment ? { environment: `IS_ANY_OF:${environment.join(',')}` } : {}),
            from: `IS:${first}`,
            to: `IS:${last}`,
            offset: String(offset),
            limit: String(pageSize),
          },
        },
      });
      if (!found.response.ok || !found.data) return toFailed(found);
      return { kind: 'changes', from: first, to: last, total: found.data.total, changes: found.data.events.map(toChange) };
    };

// Days are YYYY-MM-DD in UTC, as Unleash's from and to take them.
const toUtcDate = (date: Date): string => date.toISOString().slice(0, 10);

const daysBefore = (day: string, days: number): string => {
  const date = new Date(day);
  date.setUTCDate(date.getUTCDate() - days);
  return toUtcDate(date);
};

const toChange = ({ id, groupId, createdAt, type, createdBy, ip, project, featureName, environment }: UnleashEvent): Change => ({
  id,
  ...(groupId ? { groupId } : {}),
  changedAt: createdAt,
  type,
  changedBy: createdBy,
  ...(ip ? { ip } : {}),
  ...(project ? { project } : {}),
  ...(featureName ? { flag: featureName } : {}),
  ...(environment ? { environment } : {}),
});
