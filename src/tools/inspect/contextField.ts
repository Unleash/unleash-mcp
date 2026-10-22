import type { UnleashClient } from '../../unleash/client.ts';
import type { ContextFieldQuery } from './inspectInput.ts';
import type { InspectResult } from './inspectOutput.ts';
import { toFailed } from '../shared/failed.ts';

// A project field is read through the project path, as the Unleash UI does. Which flags use the field
// is a separate, costly request on Unleash's side, so usage is not read.
export const inspectContextField = async (unleash: UnleashClient, { project, name }: ContextFieldQuery): Promise<InspectResult> => {
  const found = project
    ? await unleash.GET('/api/admin/projects/{projectId}/context/{contextField}', { params: { path: { projectId: project, contextField: name } } })
    : await unleash.GET('/api/admin/context/{contextField}', { params: { path: { contextField: name } } });
  if (!found.response.ok || !found.data) return toFailed(found);
  const { description, stickiness, legalValues } = found.data;
  return {
    kind: 'context_field',
    name: found.data.name,
    ...(found.data.project ? { project: found.data.project } : {}),
    ...(description ? { description } : {}),
    stickiness: stickiness ?? false,
    ...(legalValues?.length ? { legalValues: legalValues.map(({ value, description }) => ({ value, ...(description ? { description } : {}) })) } : {}),
  };
};
