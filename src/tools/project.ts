import { z } from 'zod';
import type { UnleashClient } from '../unleash/client.ts';
import { type Failed, toFailed } from './failed.ts';

export const projectChoice = z.object({
  kind: z.literal('choose'),
  input: z.literal('project').describe('Input to set to one of the options'),
  message: z.string().describe('What to ask the user'),
  options: z.array(z.string()),
});

export type ProjectChoice = z.infer<typeof projectChoice>;
export type ProjectPick = { kind: 'picked'; project: string } | ProjectChoice | Failed;

// With a single project there is nothing to choose, so it is used without asking.
export const pickProject = async (unleash: UnleashClient, requested?: string): Promise<ProjectPick> => {
  if (requested) return { kind: 'picked', project: requested };

  const listed = await unleash.GET('/api/admin/projects', { params: { query: { view: 'core' } } });
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const options = listed.data.projects.map((p) => p.id);
  if (options.length === 1) return { kind: 'picked', project: options[0]! };
  return { kind: 'choose', input: 'project', message: 'Which project?', options };
};
