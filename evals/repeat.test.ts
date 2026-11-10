import assert from 'node:assert/strict';
import { test } from 'node:test';
import { repeat } from './repeat.ts';
import type { RunCost } from './run.ts';

// A wrong run fails the way an eval does, with a message over several lines.
const wrong = new Error('no production environment in:\n\n  staging\n');

// Each cost field grows with the size on its own scale, so the medians show which field fed which.
const runOfSize = (size: number): RunCost => ({
  toolCalls: size,
  toolResultTokens: size * 100,
  costUsd: size / 100,
  seconds: size * 10,
});

const scripted = (...items: (RunCost | Error)[]) => {
  return async () => {
    const next = items.shift();
    assert.ok(next, 'more runs than scripted');
    if (next instanceof Error) throw next;
    return next;
  };
};
const quiet = { diagnostic: () => {}, signal: new AbortController().signal };

test('passes one wrong run in five with the reason and the cost of the correct runs', async () => {
  const printed: string[] = [];
  const recording = { ...quiet, diagnostic: (line: string) => printed.push(line) };
  // The biggest run is also the cheapest, so a median per field differs from the fields of one median run.
  const biggest = { ...runOfSize(10), costUsd: 0.01 };
  const body = scripted(wrong, biggest, runOfSize(9), runOfSize(2), runOfSize(4));

  const medians = await repeat(recording, body, 5);

  assert.deepEqual(medians, { toolCalls: 9, toolResultTokens: 900, costUsd: 0.04, seconds: 90 });
  assert.deepEqual(printed, [
    'run 1 wrong: no production environment in: staging',
    '4/5 correct',
    'medians of the correct runs: tool calls 9, tool results ~900 tokens, $0.0400, 90.0s',
  ]);
});

test('stops at the first run whose body returned nothing', async () => {
  let calls = 0;
  const forgetful = (async () => {
    calls += 1;
  }) as unknown as () => Promise<RunCost>;

  await assert.rejects(repeat(quiet, forgetful, 5), { message: 'the eval body returned nothing, return its run' });
  assert.equal(calls, 1);
});

test('fails with one wrong run in four', async () => {
  const printed: string[] = [];
  const recording = { ...quiet, diagnostic: (line: string) => printed.push(line) };
  const body = scripted(wrong, runOfSize(1), runOfSize(1), runOfSize(1));

  await assert.rejects(repeat(recording, body, 4), { message: '3/4 correct, 4 needed' });
  assert.deepEqual(printed, ['run 1 wrong: no production environment in: staging', '3/4 correct']);
});

test('gives up once the test is cancelled', async () => {
  const cancelled = { ...quiet, signal: AbortSignal.abort() };
  let calls = 0;
  const body = async () => {
    calls += 1;
    throw new Error('aborted');
  };

  await assert.rejects(repeat(cancelled, body, 5), { message: 'aborted' });
  assert.equal(calls, 1);
});
