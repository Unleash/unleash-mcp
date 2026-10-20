import { z } from 'zod';
import type { UnleashClient } from '../unleash/client.ts';
import { type Failed, toFailed } from './failed.ts';

const features = '/api/admin/projects/{projectId}/features';
const feature = '/api/admin/projects/{projectId}/features/{featureName}';

export const createFlagConfirmation = z.object({
  kind: z.literal('confirm'),
  input: z.literal('createFlag').describe('Input to set to true once the user confirms'),
  message: z.string().describe('What to ask the user'),
});

export type CreateFlagConfirmation = z.infer<typeof createFlagConfirmation>;
// The flag as the release finds it in the environment.
type Flag = { kind: 'new' | 'existing'; enabled: boolean; strategyIds: string[] };
export type FlagStatus = Flag | CreateFlagConfirmation | Failed;

type FlagInput = { flag: string; environment: string; createFlag?: boolean };

// A missing flag is created only once the user has confirmed; the first call asks, the second creates.
export const ensureFlag = async (unleash: UnleashClient, project: string, input: FlagInput): Promise<FlagStatus> => {
  const found = await unleash.GET(feature, { params: { path: { projectId: project, featureName: input.flag } } });
  if (found.response.ok) {
    const environment = found.data?.environments?.find((e) => e.name === input.environment);
    const strategyIds = environment?.strategies?.flatMap((s) => (s.id ? [s.id] : [])) ?? [];
    return { kind: 'existing', enabled: environment?.enabled ?? false, strategyIds };
  }
  if (found.response.status !== 404) return toFailed(found);
  if (!input.createFlag) {
    return { kind: 'confirm', input: 'createFlag', message: `Flag "${input.flag}" does not exist in project ${project}. Create it?` };
  }

  const created = await unleash.POST(features, { params: { path: { projectId: project } }, body: { name: input.flag } });
  if (!created.response.ok) return toFailed(created);
  return { kind: 'new', enabled: false, strategyIds: [] };
};
