import type { TestContext } from 'node:test';

export type Run = {
  /** The model that answered, since `haiku` is an alias that moves to newer models. */
  model: string;
  answer: string;
  turns: number;
  toolCalls: number;
  /** Tool results that failed, whether the whole call or one query in it, with the tool that answered. */
  failures: { tool: string; text: string }[];
  /** Each tool result in order, with the tool that answered and the estimated tokens of the result. */
  calls: { tool: string; tokens: number }[];
  /** Tokens of every tool result, estimated at 4 characters each. This is what the server puts into the agent's context. */
  toolResultTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  seconds: number;
};

export const report = (t: TestContext, run: Run): void => {
  t.diagnostic(
    [
      run.model,
      `turns ${run.turns}`,
      `tool calls ${run.toolCalls}`,
      `failures ${run.failures.length}`,
      `tool results ~${run.toolResultTokens} tokens`,
      `tokens ${run.inputTokens} in / ${run.outputTokens} out`,
      `$${run.costUsd.toFixed(4)}`,
      `${run.seconds.toFixed(1)}s`,
    ].join(', '),
  );
  t.diagnostic(`calls: ${run.calls.map(({ tool, tokens }) => `${tool} ~${tokens}`).join(', ')}`);
  for (const { tool, text } of run.failures) t.diagnostic(`${tool} failed: ${text}`);
};
