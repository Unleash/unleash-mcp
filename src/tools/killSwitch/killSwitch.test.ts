import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { z } from 'zod';
import { createRecordedClient } from '../../unleash/testClient.ts';
import { cancelChangeRequest, deleteFlag } from '../../unleash/testSetup.ts';
import { createKillSwitch } from './killSwitch.ts';
import { killSwitchInput } from './killSwitchInput.ts';
import { killSwitchOutput } from './killSwitchOutput.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./killSwitch.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-disable-payments';
let changeRequestId: number | undefined;
// The MCP SDK checks every result against the output schema, so a result it doesn't describe never reaches the agent.
const describedByOutputSchema = (result: unknown) => z.object(killSwitchOutput).safeParse({ result }).error;

// The switch is gone before the tests, so the first one creates it.
before(() => deleteFlag(admin, project, flag));
// The change request goes first, so nothing pending refers to the switch.
after(async () => {
  if (changeRequestId) await cancelChangeRequest(unleash, project, changeRequestId);
  await deleteFlag(admin, project, flag);
  await close();
});

// The recording pins the create as a kill switch and the target for everyone.
test('creates a missing switch and turns it on for everyone', async () => {
  const output = await createKillSwitch(unleash)({
    project,
    flag: { name: flag, state: 'on' },
    environment: 'development',
  });

  assert.deepEqual(output, {
    kind: 'switched',
    flag: { status: 'new', name: flag, state: 'on' },
    environment: 'development',
    targets: [{ name: 'Everyone', rollout: 100, stickiness: 'default' }],
  });
  assert.equal(describedByOutputSchema(output), undefined);
});

test('turns an existing switch off', async () => {
  const output = await createKillSwitch(unleash)({
    project,
    flag: { name: flag, state: 'off' },
    environment: 'development',
  });

  assert.partialDeepStrictEqual(output, { kind: 'switched', flag: { status: 'existing', state: 'off' } });
});

// `mcp-server` requires change requests in production.
test('puts the switch in a change request where the environment requires one', async () => {
  const output = await createKillSwitch(unleash)({
    project,
    flag: { name: flag, state: 'on' },
    environment: 'production',
  });

  assert(output.kind === 'pending_change_request');
  changeRequestId = output.changeRequest.id;
  assert.equal(output.changeRequest.state, 'In review');
  assert.equal(describedByOutputSchema(output), undefined);
});

test("refuses release's audience, which it would drop and turn the switch on for everyone", () => {
  const parsed = killSwitchInput.safeParse({
    project: 'web',
    flag: { name: 'disable-payments', state: 'on' },
    environment: 'production',
    audience: { targets: [{ name: 'Beta' }] },
  });

  assert.deepEqual(
    parsed.error?.issues.map((i) => i.code),
    ['unrecognized_keys'],
  );
});
