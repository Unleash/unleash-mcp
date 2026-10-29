import type { Clock } from '../../clock.ts';
import type { components } from '../../unleash/api.d.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import { toFailed } from '../shared/failed.ts';
import type { AuditInput } from './auditInput.ts';
import type { AuditResult, Change } from './auditOutput.ts';
import { diffEventData } from './diff.ts';

type UnleashEvent = components['schemas']['eventSchema'];

const pageSize = 25;

// Unleash pages and filters on its side; a date range always narrows the search, so it reads a bounded slice of the event log.
export const createAudit =
  (unleash: UnleashClient, now: Clock) =>
  async ({ project, flag, environment, type, to, days, include, offset }: AuditInput): Promise<AuditResult> => {
    const last = to ?? toUtcDate(now());
    const first = daysBefore(last, days - 1);
    const found = await unleash.GET('/api/admin/search/events', {
      params: {
        query: {
          ...(project ? { project: `IS_ANY_OF:${project.join(',')}` } : {}),
          ...(flag ? { feature: `IS_ANY_OF:${flag.join(',')}` } : {}),
          ...(environment ? { environment: `IS_ANY_OF:${environment.join(',')}` } : {}),
          ...(type ? { type: `IS_ANY_OF:${type.join(',')}` } : {}),
          from: `IS:${first}`,
          to: `IS:${last}`,
          offset: String(offset),
          limit: String(pageSize),
        },
      },
    });
    if (!found.response.ok || !found.data) return toFailed(found);
    return {
      kind: 'changes',
      from: first,
      to: last,
      total: found.data.total,
      changes: found.data.events.map(toChange(include?.includes('diff') ?? false)),
    };
  };

// Days are YYYY-MM-DD in UTC, as Unleash's from and to take them.
const toUtcDate = (date: Date): string => date.toISOString().slice(0, 10);

const daysBefore = (day: string, days: number): string => {
  const date = new Date(day);
  date.setUTCDate(date.getUTCDate() - days);
  return toUtcDate(date);
};

const toChange =
  (withDiff: boolean) =>
  ({
    id,
    groupId,
    createdAt,
    type,
    createdBy,
    ip,
    project,
    featureName,
    environment,
    preData,
    data,
  }: UnleashEvent): Change => ({
    id,
    ...(groupId ? { groupId } : {}),
    changedAt: createdAt,
    type,
    changedBy: createdBy,
    ...(ip ? { ip } : {}),
    ...(project ? { project } : {}),
    ...(featureName ? { flag: featureName } : {}),
    ...(environment ? { environment } : {}),
    ...(withDiff ? { diff: diffEventData(preData, data) } : {}),
  });
