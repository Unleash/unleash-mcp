import type { UnleashClient } from '../../unleash/client.ts';

export const projectUrl = ({ baseUrl }: UnleashClient, projectId: string): string =>
  `${baseUrl}/projects/${encodeURIComponent(projectId)}`;

export const changeRequestUrl = (unleash: UnleashClient, projectId: string, id: number): string =>
  `${projectUrl(unleash, projectId)}/change-requests/${id}`;

export const flagUrl = (unleash: UnleashClient, projectId: string, flagName: string): string =>
  `${projectUrl(unleash, projectId)}/features/${encodeURIComponent(flagName)}`;
