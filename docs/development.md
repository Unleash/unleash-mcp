# Development

## Setup

- `nvm use` for Node 26, the development version. The server supports Node 24+.
- `pnpm install`
- Copy `.env.example` to `.env` (gitignored) and fill in a PAT for the Unleash sandbox.
- `pnpm install` points git at `.githooks`, whose pre-commit hook runs `pnpm check`. `git commit --no-verify` skips it.

## Dev server in Claude Code

The checked-in `.mcp.json` registers the server as `unleash-dev`. It runs `src/index.ts` directly and loads secrets from `.env`.

- Plain `claude` asks once to approve the project server.
- `claude --mcp-config .mcp.json --strict-mcp-config` skips that prompt.

## Evals

An eval runs Claude Code headless on a prompt, with this working tree's server as its only tools, against the live sandbox, and checks what came of it: the answer, or the Unleash state read back over the Admin API. Each run is a Claude Code session on a cheap model that takes seconds to minutes, so `pnpm eval` stays out of `pnpm check`.

- `.env` needs `UNLEASH_ADMIN_PAT` as well: an eval sets up its own `mcp-eval-*` project as the admin, like a recorded test, and the agent writes as the user under test.
- `claude` has to be on the PATH and logged in; the eval uses that login, not an API key.
- `pnpm eval` runs every eval several times and passes when most runs are correct (the count and the share are in `evals/repeat.ts`). `pnpm eval:once` runs each once, a look rather than a verdict since one heavy run then fails its ceiling; for one file, `EVAL_RUNS=1 node --env-file=.env --test --test-timeout=600000 evals/release.eval.ts`.
- Every run prints what it cost (tool calls, tool result tokens, seconds) and the eval prints the medians of its correct runs. An eval asserts a ceiling on those medians, set from the runs like a coverage mark, so a change that makes the agent work harder goes red. Raise it only when the extra work is meant.
- Every eval project and flag name ends in your OS username (`evalName` in `evals/unleash.ts`), since the sandbox is shared. The last run's project stays for a look.
- A new eval copies the nearest one in `evals/`; `.claude/rules/evals.md` has the rules.
