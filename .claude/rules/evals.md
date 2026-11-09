---
paths:
  - "evals/**"
---

# Evals

- An eval runs Claude Code headless on a prompt through `runAgent` (`evals/agent.ts`), with this working tree's MCP server as its only tools and none of this repo's or the user's Claude Code context. It reports what the run cost as a test diagnostic and asserts the outcome, never which tools were called.
- Files are `evals/**/*.eval.ts`, run with `pnpm eval`: they spawn an agent and cost money, so they stay out of `pnpm test` and `pnpm check`; the `evals/*.test.ts` files run with `pnpm test`.

Why: `docs/decisions.md` (Lightweight eval tool, built here; The eval agent sees nothing of the repo).
