import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';

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

export type RunOutcome = { kind: 'correct' } | { kind: 'wrong'; reason: string };

// An assertion message spans several lines and a diagnostic is one line per run.
const reasonOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replaceAll(/\s*\n\s*/g, ' ').trim();

// Runs go one after the other because flag names are unique across the instance, so parallel runs would collide.
export const repeat = async (
  t: Pick<TestContext, 'diagnostic' | 'signal'>,
  body: () => Promise<void>,
  runs = runsFromEnv(),
): Promise<RunOutcome[]> => {
  const outcomes: RunOutcome[] = [];
  for (let i = 1; i <= runs; i++) {
    try {
      await body();
      outcomes.push({ kind: 'correct' });
    } catch (error) {
      // A cancelled test (the timeout, most likely) has no verdict to reach, so the remaining runs are not spent.
      if (t.signal.aborted) throw error;
      const reason = reasonOf(error);
      t.diagnostic(`run ${i} wrong: ${reason}`);
      outcomes.push({ kind: 'wrong', reason });
    }
  }
  const correctRuns = outcomes.filter((outcome) => outcome.kind === 'correct').length;
  const requiredRuns = Math.ceil(runs * requiredShare);
  const tally = `${correctRuns}/${runs} correct`;
  t.diagnostic(tally);
  assert.ok(correctRuns >= requiredRuns, `${tally}, ${requiredRuns} needed`);
  return outcomes;
};
