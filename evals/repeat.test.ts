import assert from 'node:assert/strict';
import { test } from 'node:test';
import { repeat } from './repeat.ts';

// A wrong run fails the way an eval does, with a message over several lines.
const wrongFirst = (wrongRuns: number) => {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls <= wrongRuns) throw new Error('no production environment in:\n\n  staging\n');
  };
};
const quiet = { diagnostic: () => {}, signal: new AbortController().signal };

test('passes with one wrong run in five and says why it was wrong', async () => {
  const printed: string[] = [];
  const recording = { ...quiet, diagnostic: (line: string) => printed.push(line) };

  const outcomes = await repeat(recording, wrongFirst(1), 5);

  const reason = 'no production environment in: staging';
  assert.deepEqual(outcomes, [
    { kind: 'wrong', reason },
    { kind: 'correct' },
    { kind: 'correct' },
    { kind: 'correct' },
    { kind: 'correct' },
  ]);
  assert.deepEqual(printed, [`run 1 wrong: ${reason}`, '4/5 correct']);
});

test('fails with one wrong run in four', async () => {
  await assert.rejects(repeat(quiet, wrongFirst(1), 4), { message: '3/4 correct, 4 needed' });
});

test('gives up once the test is cancelled', async () => {
  const cancelled = { ...quiet, signal: AbortSignal.abort() };
  let calls = 0;
  const wrong = async () => {
    calls += 1;
    throw new Error('aborted');
  };

  await assert.rejects(repeat(cancelled, wrong, 5), { message: 'aborted' });
  assert.equal(calls, 1);
});
