---
paths:
  - "evals/**"
---

# Evals

- An eval runs Claude Code headless on a prompt through `runAgent` (`evals/agent.ts`), from an empty directory so nothing of this repo (CLAUDE.md, rules, memory) biases it, with this working tree's MCP server as its only tools, reports what the run cost as a test diagnostic (turns, tool calls, tool errors, tool result tokens, estimated at 4 characters each, tokens, dollars, seconds, and each call with the size of its result), and asserts the outcome: the answer, or the Unleash state read back with `readFlag` and `readFlags` from `evals/unleash.ts`. Never assert which tools were called.
- Each journey has a budget, checked with `assertWithinBudget`: no writing tool was refused (a lookup may fail, such as a check whether a flag exists), and ceilings on tool calls and on tokens of tool results, set from the worst pass seen. Raise a budget only after reading why a run exceeded it.
- Files are `evals/*.eval.ts`, run with `pnpm eval`: they spawn an agent and cost money, so they stay out of `pnpm test` and `pnpm check`.
- Each file that writes creates its own project with `createEvalProject` in `before`, named `mcp-eval-*`, with change requests off so a write lands; flags are named `mcp-eval-*` and are unique across the instance. Setup goes through the tool functions as the admin, as in the tests.
- A failure in `before` is the sandbox (its status is in the message); a failure in a test is the agent.

Why: `docs/decisions.md` (Lightweight eval tool, built here).
