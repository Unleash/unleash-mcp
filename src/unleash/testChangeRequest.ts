import type { Interceptable } from 'undici';

// Only Enterprise has change requests, so a tool reads a project's settings only after this edition answer.
export const stubEnterprise = (stub: Interceptable) =>
  stub
    .intercept({ path: '/api/admin/ui-config', method: 'GET' })
    .reply(200, { environment: 'Enterprise', versionInfo: { current: { oss: '8.2.0', enterprise: '8.2.1' } } });

export const production = { environment: 'production', type: 'production' };

// Enterprise, with change requests enabled in the given environments of the project; none when none are given.
export const stubChangeRequestsIn = (
  stub: Interceptable,
  project: string,
  ...environments: { environment: string; type: string }[]
) => {
  stubEnterprise(stub);
  return stub.intercept({ path: `/api/admin/projects/${project}/change-requests/config`, method: 'GET' }).reply(
    200,
    environments.map((e) => ({ ...e, requiredApprovals: 1, changeRequestEnabled: true })),
  );
};
