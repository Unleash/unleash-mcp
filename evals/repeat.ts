import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { costParts, type RunCost } from './run.ts';

// One wrong run in five is the model wobbling, two is a tool that needs work. With fewer runs none may go wrong.
const defaultRuns = 5;
const requiredShare = 0.8;

// EVAL_RUNS=1 is for a quick look while editing. A blank value, as an env file line leaves it, means unset.
const runsFromEnv = (): number => {
  const runs = Number(process.env.EVAL_RUNS?.trim() || defaultRuns);
  assert.ok(
    Number.isInteger(runs) && runs > 0,
    `EVAL_RUNS must be a whole number above 0, got ${process.env.EVAL_RUNS}`,
  );
  return runs;
};

// An assertion message spans several lines and a diagnostic is one line per run.
const reasonOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replaceAll(/\s*\n\s*/g, ' ').trim();

// Of an even count, the upper middle rather than an average of the two, so it is always a number some run had.
const upperMedian = (values: number[]): number => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

const medianCost = (runs: RunCost[]): RunCost => {
  const medianOf = (field: keyof RunCost): number => upperMedian(runs.map((run) => run[field]));
  return {
    toolCalls: medianOf('toolCalls'),
    toolResultTokens: medianOf('toolResultTokens'),
    costUsd: medianOf('costUsd'),
    seconds: medianOf('seconds'),
  };
};

// Runs go one after the other because flag names are unique across the instance, so parallel runs would collide.
export const repeat = async (
  t: Pick<TestContext, 'diagnostic' | 'signal'>,
  body: () => Promise<RunCost>,
  runs = runsFromEnv(),
): Promise<RunCost> => {
  const correctRuns: RunCost[] = [];
  for (let i = 1; i <= runs; i++) {
    let run: RunCost | undefined;
    try {
      run = await body();
    } catch (error) {
      // A cancelled test (the timeout, most likely) has no verdict to reach, so the remaining runs are not spent.
      if (t.signal.aborted) throw error;
      t.diagnostic(`run ${i} wrong: ${reasonOf(error)}`);
      continue;
    }
    // pnpm eval runs without a typecheck, so a body that forgets to return its run gets past the types to here.
    assert.ok(run, 'the eval body returned nothing, return its run');
    correctRuns.push(run);
  }
  const requiredRuns = Math.ceil(runs * requiredShare);
  const tally = `${correctRuns.length}/${runs} correct`;
  t.diagnostic(tally);
  assert.ok(correctRuns.length >= requiredRuns, `${tally}, ${requiredRuns} needed`);

  const medians = medianCost(correctRuns);
  t.diagnostic(`medians of the correct runs: ${costParts(medians).join(', ')}`);
  return medians;
};
