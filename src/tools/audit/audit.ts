import type { components } from '../../unleash/api.d.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import type { AuditInput } from './auditInput.ts';
import type { AuditResult, Change } from './auditOutput.ts';
import { toFailed } from '../shared/failed.ts';

type UnleashEvent = components['schemas']['eventSchema'];

// Unleash pages and filters on its side.
export const createAudit =
  (unleash: UnleashClient) =>
    async ({ flag, offset, limit }: AuditInput): Promise<AuditResult> => {
      const found = await unleash.GET('/api/admin/search/events', { params: { query: { feature: `IS:${flag}`, offset: String(offset), limit: String(limit) } } });
      if (!found.response.ok || !found.data) return toFailed(found);
      return { kind: 'changes', total: found.data.total, changes: found.data.events.map(toChange) };
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
