import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUnleashClient } from '../unleash/client.ts';
import { type Decision, release, type ReleaseResult } from './release.ts';

type Call = { method: string; path: string; body?: unknown };
type Route = (call: Call) => Response | undefined;

/** Fake Unleash: records every call and answers from the routes, 404 otherwise. */
const fakeUnleash = (routes: Route[]) => {
  const calls: Call[] = [];
  const unleash = createUnleashClient({
    baseUrl: 'https://unleash.example',
    headers: {},
    fetch: async (req) => {
      const r = req as Request;
      const call: Call = { method: r.method, path: new URL(r.url).pathname, body: r.body ? await r.json() : undefined };
      calls.push(call);
      for (const route of routes) {
        const res = route(call);
        if (res) return res;
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    },
  });
  return { unleash, calls, writes: () => calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`) };
};

const on = (method: string, path: string, body: unknown = {}, status = 200): Route =>
  (c) => (c.method === method && c.path === path ? Response.json(body, { status }) : undefined);

const fe = (projectId: string, flag: string, env: string) => `/api/admin/projects/${projectId}/features/${flag}/environments/${env}`;

const base = (overrides: Route[] = []) => [
  ...overrides,
  on('GET', '/api/admin/projects', { version: 1, projects: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }] }),
  on('GET', '/api/admin/environments/project/p1', { version: 1, environments: [{ name: 'dev', type: 'development', enabled: true, protected: false, sortOrder: 1 }, { name: 'prod', type: 'production', enabled: true, protected: true, sortOrder: 2 }] }),
  on('GET', '/api/admin/projects/p1/change-requests/config', [{ environment: 'prod', type: 'production', changeRequestEnabled: true, requiredApprovals: 1 }]),
  on('GET', '/api/admin/context', [{ name: 'userId' }]),
  on('GET', '/api/admin/projects/p1/context', [{ name: 'tier', legalValues: [{ value: 'free' }, { value: 'pro' }] }]),
  on('GET', '/api/admin/segments', { segments: [{ id: 7, name: 'beta', constraints: [], project: 'p1' }, { id: 8, name: 'other', constraints: [], project: 'p2' }] }),
];

const decisions = (r: ReleaseResult): Decision[] => {
  assert.equal(r.kind, 'decisions', `expected decisions, got ${r.kind}`);
  return (r as { decisions: Decision[] }).decisions;
};
const decision = (r: ReleaseResult): Decision => {
  const all = decisions(r);
  assert.equal(all.length, 1, `expected one decision, got ${all.map((d) => d.message).join(' / ')}`);
  return all[0]!;
};
const options = (d: Decision): string[] => (d as { options: string[] }).options;

test('asks to choose the project when it is missing and there are several', async () => {
  const { unleash } = fakeUnleash(base());
  const d = decision(await release(unleash, { flag: 'f', targets: [{}] }));
  assert.deepEqual(d, { kind: 'choose', message: 'Which project?', options: ['p1', 'p2'] });
});

test('asks to choose the environment from the enabled ones', async () => {
  const { unleash } = fakeUnleash(base());
  const d = decision(await release(unleash, { project: 'p1', flag: 'f', environment: 'staging', targets: [{}] }));
  assert.deepEqual(options(d), ['dev', 'prod']);
});

test('asks to confirm creating a missing flag, then creates it when confirmed', async () => {
  const { unleash, writes } = fakeUnleash(base([
    on('POST', '/api/admin/projects/p1/features', { name: 'f' }),
    on('POST', `${fe('p1', 'f', 'dev')}/strategies`, { id: 's1', name: 'flexibleRollout' }),
    on('POST', `${fe('p1', 'f', 'dev')}/on`, {}),
  ]));
  const d = decision(await release(unleash, { project: 'p1', flag: 'f', environment: 'dev', targets: [{ rollout: 50 }] }));
  assert.deepEqual(d, { kind: 'confirm', id: 'createFlag', message: 'Flag "f" does not exist in project p1. Create it?' });
  assert.deepEqual(writes(), []);

  const r = await release(unleash, { project: 'p1', flag: 'f', environment: 'dev', targets: [{ rollout: 50 }], confirm: ['createFlag'] });
  assert.deepEqual(r, { kind: 'released', flag: 'f', environment: 'dev', strategies: ['- 50%'] });
  assert.deepEqual(writes(), [
    'POST /api/admin/projects/p1/features',
    `POST ${fe('p1', 'f', 'dev')}/strategies`,
    `POST ${fe('p1', 'f', 'dev')}/on`,
  ]);
});

test('updates existing strategies in place, adds extras, never toggles when already enabled', async () => {
  const { unleash, calls, writes } = fakeUnleash(base([
    on('GET', fe('p1', 'f', 'dev'), { name: 'dev', enabled: true, strategies: [{ id: 'old', name: 'default' }] }),
    on('PUT', `${fe('p1', 'f', 'dev')}/strategies/old`, { id: 'old', name: 'flexibleRollout' }),
    on('POST', `${fe('p1', 'f', 'dev')}/strategies`, { id: 's', name: 'flexibleRollout' }),
  ]));
  const r = await release(unleash, {
    project: 'p1', flag: 'f', environment: 'dev',
    targets: [{ rollout: 50 }, { segments: ['beta'], value: { name: 'v2', payload: { type: 'string', value: 'blue' } } }],
  });
  assert.deepEqual(r, { kind: 'released', flag: 'f', environment: 'dev', strategies: ['- 50%', '- 100% | segments beta | value v2'] });
  assert.deepEqual(writes(), [`PUT ${fe('p1', 'f', 'dev')}/strategies/old`, `POST ${fe('p1', 'f', 'dev')}/strategies`]);
  assert.deepEqual(calls.find((c) => c.method === 'PUT')?.body, {
    name: 'flexibleRollout',
    title: '50%',
    parameters: { rollout: '50', stickiness: 'default', groupId: 'f' },
    constraints: [],
    segments: [],
    variants: [],
  });
  assert.deepEqual(calls.find((c) => c.method === 'POST')?.body, {
    name: 'flexibleRollout',
    title: '100% | segments beta | value v2',
    parameters: { rollout: '100', stickiness: 'default', groupId: 'f' },
    constraints: [],
    segments: [7],
    variants: [{ name: 'v2', weight: 1000, weightType: 'variable', stickiness: 'default', payload: { type: 'string', value: 'blue' } }],
  });
});

test('deletes surplus strategies after updating, so the environment never has zero strategies', async () => {
  const { unleash, writes } = fakeUnleash(base([
    on('GET', fe('p1', 'f', 'dev'), { name: 'dev', enabled: true, strategies: [{ id: 'a', name: 'flexibleRollout' }, { id: 'b', name: 'flexibleRollout' }] }),
    on('PUT', `${fe('p1', 'f', 'dev')}/strategies/a`, { id: 'a', name: 'flexibleRollout' }),
    on('DELETE', `${fe('p1', 'f', 'dev')}/strategies/b`, {}),
  ]));
  const r = await release(unleash, { project: 'p1', flag: 'f', environment: 'dev', targets: [{ rollout: 100 }] });
  assert.equal(r.kind, 'released');
  assert.deepEqual(writes(), [`PUT ${fe('p1', 'f', 'dev')}/strategies/a`, `DELETE ${fe('p1', 'f', 'dev')}/strategies/b`]);
});

test('stops at an illegal constraint value with the legal ones, and writes nothing', async () => {
  const { unleash, writes } = fakeUnleash(base([on('GET', fe('p1', 'f', 'dev'), { name: 'dev', enabled: true, strategies: [] })]));
  const d = decision(await release(unleash, { project: 'p1', flag: 'f', environment: 'dev', targets: [{ constraints: [{ field: 'tier', operator: 'IN', values: ['enterprise'] }] }] }));
  assert.match(d.message, /"enterprise" is not among the legal values of tier/);
  assert.deepEqual(options(d), ['free', 'pro']);
  assert.deepEqual(writes(), []);
});

test('stops at an unknown context field, listing global and project fields', async () => {
  const { unleash } = fakeUnleash(base([on('GET', fe('p1', 'f', 'dev'), { name: 'dev', enabled: true, strategies: [] })]));
  const d = decision(await release(unleash, { project: 'p1', flag: 'f', environment: 'dev', targets: [{ constraints: [{ field: 'nope', operator: 'IN', values: ['x'] }] }] }));
  assert.deepEqual(options(d), ['userId', 'tier']);
});

test('stops at an unknown segment, listing only segments visible to the project', async () => {
  const { unleash, writes } = fakeUnleash(base([on('GET', fe('p1', 'f', 'dev'), { name: 'dev', enabled: true, strategies: [] })]));
  const d = decision(await release(unleash, { project: 'p1', flag: 'f', environment: 'dev', targets: [{ segments: ['internal'] }] }));
  assert.deepEqual(options(d), ['beta']);
  assert.deepEqual(writes(), []);
});

test('collects independent decisions in one pass', async () => {
  const { unleash, writes } = fakeUnleash(base());
  const r = await release(unleash, {
    project: 'p1', flag: 'f', environment: 'staging',
    targets: [{ constraints: [{ field: 'tier', operator: 'IN', values: ['enterprise'] }, { field: 'nope', operator: 'IN', values: ['x'] }], segments: ['internal'] }],
  });
  assert.deepEqual(decisions(r).map((d) => d.message.split(/[."]/)[0]), ['Environment ', '', 'Unknown context field ', 'Segment ']);
  assert.deepEqual(writes(), []);
});

test('opens a change request when the environment requires it', async () => {
  const { unleash, calls, writes } = fakeUnleash(base([
    on('GET', fe('p1', 'f', 'prod'), { name: 'prod', enabled: false, strategies: [{ id: 'old', name: 'default' }] }),
    on('POST', '/api/admin/projects/p1/environments/prod/change-requests', { id: 42, state: 'Draft' }),
  ]));
  const r = await release(unleash, { project: 'p1', flag: 'f', environment: 'prod', targets: [{ rollout: 25 }] });
  assert.deepEqual(r, { kind: 'pending_change_request', flag: 'f', environment: 'prod', changeRequest: { id: 42, state: 'Draft' }, strategies: ['- 25%'] });
  const cr = calls.find((c) => c.path.endsWith('/change-requests'))!.body as { action: string; payload: { id?: string } }[];
  assert.deepEqual(cr.map((c) => c.action), ['updateStrategy', 'updateEnabled']);
  assert.equal(cr[0]!.payload.id, 'old');
  assert.deepEqual(writes(), ['POST /api/admin/projects/p1/environments/prod/change-requests']);
});

test('an API failure mid-way is a failed result listing what was already applied', async () => {
  const { unleash, writes } = fakeUnleash(base([
    on('GET', fe('p1', 'f', 'dev'), { name: 'dev', enabled: false, strategies: [{ id: 'a', name: 'flexibleRollout' }] }),
    on('PUT', `${fe('p1', 'f', 'dev')}/strategies/a`, { id: 'a' }),
    on('POST', `${fe('p1', 'f', 'dev')}/strategies`, { name: 'BadDataError', message: 'There must be at least one "variable" variant' }, 400),
  ]));
  const r = await release(unleash, { project: 'p1', flag: 'f', environment: 'dev', targets: [{ rollout: 50 }, { rollout: 100 }] });
  assert.deepEqual(r, {
    kind: 'failed',
    error: 'add strategy "100%" (HTTP 400): There must be at least one "variable" variant',
    applied: ['updated strategy "50%"'],
  });
  assert.deepEqual(writes(), [`PUT ${fe('p1', 'f', 'dev')}/strategies/a`, `POST ${fe('p1', 'f', 'dev')}/strategies`], 'stops at the failure');
});

test('a failing read is a failed result with nothing applied', async () => {
  const { unleash } = fakeUnleash([on('GET', '/api/admin/projects', { message: 'invalid token' }, 401)]);
  const r = await release(unleash, { flag: 'f', targets: [{}] });
  assert.deepEqual(r, { kind: 'failed', error: 'read projects (HTTP 401): invalid token', applied: [] });
});
