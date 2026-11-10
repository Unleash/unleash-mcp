---
paths:
  - "evals/**"
---

# Evals

- An eval runs Claude Code headless on a prompt through `runAgent` (`evals/agent.ts`), with this working tree's MCP server as its only tools and none of this repo's or the user's Claude Code context. It reports what the run cost as a test diagnostic and asserts the outcome, never which tools were called.
- An eval wraps its run and assertions in `repeat` (`evals/repeat.ts`): several runs one after the other, anything thrown is a wrong run, and a share of them must be correct. The body returns its `Run`, and `repeat` prints and returns the medians of the correct runs' cost, so an eval can assert a ceiling. `EVAL_RUNS=1 pnpm eval` is for a quick look while editing.
- An eval that needs Unleash state creates its own project with `createEvalProject` (`evals/unleash.ts`), per run when the agent writes, and reads what the agent did back from the Admin API as the admin (`readFlag`, `readFlags`), never through the server's own tools, which are what is under test. An eval that writes asserts the end state the prompt asked for, then a ceiling on the medians it gets back.
- Files are `evals/**/*.eval.ts`, run with `pnpm eval`: they spawn an agent and cost money, so they stay out of `pnpm test` and `pnpm check`; the `evals/*.test.ts` files run with `pnpm test`.

Why: `docs/decisions.md` (Lightweight eval tool, built here; The eval agent sees nothing of the repo; An eval is several runs; An eval that writes has its own project and a ceiling).
