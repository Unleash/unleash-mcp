import { z } from 'zod';
import type { UnleashClient } from '../unleash/client.ts';
import { type Failed, toFailed } from './failed.ts';

export const segmentChoice = z.object({
  kind: z.literal('choose'),
  input: z.literal('segments').describe('Input to set to some of the options'),
  message: z.string().describe('What to ask the user'),
  options: z.array(z.string()),
});

export type SegmentChoice = z.infer<typeof segmentChoice>;
export type SegmentPick = { kind: 'picked'; ids: Map<string, number> } | SegmentChoice | Failed;

export const pickSegments = async (unleash: UnleashClient, project: string, names: string[]): Promise<SegmentPick> => {
  if (names.length === 0) return { kind: 'picked', ids: new Map() };

  const listed = await unleash.GET('/api/admin/segments');
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const usable = (listed.data.segments ?? []).filter(isUsableIn(project));
  const ids = new Map(usable.map((s) => [s.name, s.id]));

  const unknown = [...new Set(names)].filter((name) => !ids.has(name));
  if (unknown.length === 0) return { kind: 'picked', ids };
  const message = `${unknown.length === 1 ? 'Segment' : 'Segments'} ${unknown.map((n) => `"${n}"`).join(', ')} not found in project ${project}. Which segments?`;
  return { kind: 'choose', input: 'segments', message, options: [...ids.keys()] };
};

const isUsableIn =
  (project: string) =>
  (segment: { project?: string | null }): boolean =>
    !segment.project || segment.project === project;
