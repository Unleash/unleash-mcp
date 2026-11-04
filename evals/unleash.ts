import assert from 'node:assert/strict';
import { z } from 'zod';
import { systemClock } from '../src/clock.ts';
import { createProject, updateProject } from '../src/tools/configure/project.ts';
import { inspectFlag } from '../src/tools/inspect/flag/flag.ts';
import type { Flag } from '../src/tools/inspect/inspectOutput.ts';
import { searchFlags } from '../src/tools/search/flags/flags.ts';
import type { Flags } from '../src/tools/search/searchOutput.ts';
import type { EditionReader } from '../src/tools/shared/changeRequest.ts';
import { createUnleashClient } from '../src/unleash/client.ts';
import { applied, deleteProject } from '../src/unleash/testSetup.ts';

// Evals set up and read back Unleash state the way the recorded tests do, but against the live sandbox: the agent writes
// as the user under test, and setup and grading go as the admin.
const env = z
  .object({ UNLEASH_BASE_URL: z.string(), UNLEASH_PAT: z.string(), UNLEASH_ADMIN_PAT: z.string() })
  .parse(process.env);
const client = (token: string) =>
  createUnleashClient({ baseUrl: env.UNLEASH_BASE_URL, headers: { Authorization: token }, fetch: globalThis.fetch });
export const unleash = client(env.UNLEASH_PAT);
export const admin = client(env.UNLEASH_ADMIN_PAT);

// An eval project never requires change requests, so a write lands and the state can be read back.
const noChangeRequests: EditionReader = async () => ({ kind: 'other' });

/** A fresh project for an eval file, in place of what an earlier run left of it. */
export const createEvalProject = async (name: string): Promise<void> => {
  await deleteProject(admin, unleash, name);
  const created = applied(
    await createProject(unleash, {
      kind: 'project',
      action: 'create',
      name,
      environments: ['development', 'production'],
    }),
  );
  assert.equal(created.id, name);
  // An instance can require change requests in every new project's environment.
  applied(
    await updateProject(admin, {
      kind: 'project',
      action: 'update',
      id: name,
      name,
      changeRequestEnvironments: [
        { name: 'development', enabled: false },
        { name: 'production', enabled: false },
      ],
    }),
  );
};

export const readFlag = async (project: string, flag: string): Promise<Flag> => {
  const found = await inspectFlag(admin, noChangeRequests, systemClock, { kind: 'flag', project, flag });
  assert(found.kind === 'flag', `reading ${flag}: ${JSON.stringify(found)}`);
  return found;
};

export const readFlags = async (project: string): Promise<Flags['flags']> => {
  const found = await searchFlags(admin, { kind: 'flags', project, offset: 0, limit: 50 });
  assert(found.kind === 'flags', `listing ${project}: ${JSON.stringify(found)}`);
  return found.flags;
};
