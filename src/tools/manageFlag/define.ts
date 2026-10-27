import type { components } from '../../unleash/api.d.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import { type Failed, toFailed } from '../shared/failed.ts';
import type { FlagType } from '../shared/flagType.ts';
import type { Link } from '../shared/link.ts';
import type { Tag } from '../shared/tag.ts';
import type { Define } from './manageFlagInput.ts';
import type { Changed, Outcome } from './manageFlagOutput.ts';

const features = '/api/admin/projects/{projectId}/features';
const feature = '/api/admin/projects/{projectId}/features/{featureName}';
const tagsOf = '/api/admin/features/{featureName}/tags';
const linksOf = '/api/admin/projects/{projectId}/features/{featureName}/link';
const linkOf = '/api/admin/projects/{projectId}/features/{featureName}/link/{linkId}';

type UnleashFlag = components['schemas']['featureSchema'];
type Path = { projectId: string; featureName: string };
type Listed = Omit<Define, 'action' | 'project' | 'flag'>;
type Synced = { kind: 'synced'; changed: Changed[] } | Failed;

// Each part of the flag is brought in line on its own, in turn, so a failure leaves the flag with what came before.
/** Creates the flag, or brings an existing one to what is listed, answering Unleash's refusal as `failed`. */
export const defineFlag = async (unleash: UnleashClient, { project, flag, ...listed }: Define): Promise<Outcome> => {
  const path = { projectId: project, featureName: flag };
  const found = await unleash.GET(feature, { params: { path } });
  if (found.response.status === 404) return defineNew(unleash, path, listed);
  if (!found.response.ok || !found.data) return toFailed(found);
  return defineExisting(unleash, path, found.data, listed);
};

const defineNew = async (unleash: UnleashClient, path: Path, { type, description, tags, links }: Listed): Promise<Outcome> => {
  const created = await unleash.POST(features, { params: { path: { projectId: path.projectId } }, body: { name: path.featureName, type, description } });
  if (!created.response.ok) return toFailed(created);
  const syncedTags = await syncTags(unleash, path, [], tags);
  if (syncedTags.kind === 'failed') return syncedTags;
  const syncedLinks = await syncLinks(unleash, path, [], links);
  if (syncedLinks.kind === 'failed') return syncedLinks;
  return { kind: 'applied', status: 'new', changed: [...syncedTags.changed, ...syncedLinks.changed] };
};

// The flag read leaves the tags out, so they are read when some are listed.
const defineExisting = async (unleash: UnleashClient, path: Path, current: UnleashFlag, { type, description, tags, links }: Listed): Promise<Outcome> => {
  const syncedDetails = await syncDetails(unleash, path, current, { type, description });
  if (syncedDetails.kind === 'failed') return syncedDetails;
  const has = tags ? await readTags(unleash, path) : { kind: 'read' as const, tags: [] };
  if (has.kind === 'failed') return has;
  const syncedTags = await syncTags(unleash, path, has.tags, tags);
  if (syncedTags.kind === 'failed') return syncedTags;
  const syncedLinks = await syncLinks(unleash, path, current.links ?? [], links);
  if (syncedLinks.kind === 'failed') return syncedLinks;
  return { kind: 'applied', status: 'existing', changed: [...syncedDetails.changed, ...syncedTags.changed, ...syncedLinks.changed] };
};

// Unleash's update replaces the whole flag, so the current values go back with it.
const syncDetails = async (unleash: UnleashClient, path: Path, current: UnleashFlag, { type, description }: Pick<Listed, 'type' | 'description'>): Promise<Synced> => {
  const changed: Changed[] = [
    ...(type !== undefined && type !== current.type ? ['type' as const] : []),
    ...(description !== undefined && description !== (current.description ?? '') ? ['description' as const] : []),
  ];
  if (!changed.length) return { kind: 'synced', changed };
  const updated = await unleash.PUT(feature, {
    params: { path },
    body: { type: type ?? (current.type as FlagType), description: description ?? current.description ?? undefined, stale: current.stale, impressionData: current.impressionData },
  });
  if (!updated.response.ok) return toFailed(updated);
  return { kind: 'synced', changed };
};

// Unleash's tags carry a colour too, which has no place in a removal.
const readTags = async (unleash: UnleashClient, path: Path): Promise<{ kind: 'read'; tags: Tag[] } | Failed> => {
  const tagged = await unleash.GET(tagsOf, { params: { path: { featureName: path.featureName } } });
  if (!tagged.response.ok || !tagged.data) return toFailed(tagged);
  return { kind: 'read', tags: tagged.data.tags.map(({ type, value }) => ({ type, value })) };
};

// The tags endpoint takes what to add and what to remove in one request, and creates a missing tag.
const syncTags = async (unleash: UnleashClient, path: Path, has: Tag[], listed?: Tag[]): Promise<Synced> => {
  if (!listed) return { kind: 'synced', changed: [] };
  const addedTags = listed.filter((t) => !has.some((h) => sameTag(h, t)));
  const removedTags = has.filter((h) => !listed.some((t) => sameTag(h, t)));
  if (!addedTags.length && !removedTags.length) return { kind: 'synced', changed: [] };
  const retagged = await unleash.PUT(tagsOf, { params: { path: { featureName: path.featureName } }, body: { addedTags, removedTags } });
  if (!retagged.response.ok) return toFailed(retagged);
  return { kind: 'synced', changed: ['tags'] };
};

// Links are told apart by URL. Unleash adds a link again on a second post, so only the missing go in, and the
// unlisted go out by id, one request each.
const syncLinks = async (unleash: UnleashClient, path: Path, has: { id: string; url: string }[], listed?: Link[]): Promise<Synced> => {
  if (!listed) return { kind: 'synced', changed: [] };
  const missing = listed.filter((l) => !has.some((h) => h.url === l.url));
  const unlisted = has.filter((h) => !listed.some((l) => l.url === h.url));
  for (const { id } of unlisted) {
    const removed = await unleash.DELETE(linkOf, { params: { path: { ...path, linkId: id } } });
    if (!removed.response.ok) return toFailed(removed);
  }
  for (const link of missing) {
    const linked = await unleash.POST(linksOf, { params: { path }, body: link });
    if (!linked.response.ok) return toFailed(linked);
  }
  if (!missing.length && !unlisted.length) return { kind: 'synced', changed: [] };
  return { kind: 'synced', changed: ['links'] };
};

const sameTag = (a: Tag, b: Tag): boolean => a.type === b.type && a.value === b.value;
