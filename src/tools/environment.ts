import { z } from 'zod';
import type { UnleashClient } from '../unleash/client.ts';
import { type Failed, toFailed } from './failed.ts';

export const environmentChoice = z.object({
  kind: z.literal('choose'),
  input: z.literal('environment').describe('Input to set to one of the options'),
  message: z.string().describe('What to ask the user'),
  options: z.array(z.string()),
});

export type EnvironmentChoice = z.infer<typeof environmentChoice>;
export type EnvironmentPick = { kind: 'picked'; environment: string } | EnvironmentChoice | Failed;

export const pickEnvironment = async (unleash: UnleashClient, project: string, requested?: string): Promise<EnvironmentPick> => {
  const listed = await unleash.GET('/api/admin/environments/project/{projectId}', { params: { path: { projectId: project } } });
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const releasable = listed.data.environments.filter((e) => e.enabled).map((e) => e.name);
  const [onlyReleasable] = releasable.length === 1 ? releasable : [];

  if (requested && releasable.includes(requested)) return { kind: 'picked', environment: requested };
  if (!requested && onlyReleasable) return { kind: 'picked', environment: onlyReleasable };
  const message = requested ? `Environment "${requested}" is not enabled in project ${project}. Which environment?` : 'Which environment?';
  return { kind: 'choose', input: 'environment', message, options: releasable };
};
