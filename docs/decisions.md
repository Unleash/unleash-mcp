# v2 decisions

Decisions are recorded in the words of the person who made them, with only minor corrections.
Add a dated entry for every decision so any developer can take over driving the implementation.
Only record decisions that have long term impact. Don't record microdecisions that only make sense
for a short time (e.g. what the next increment contains).

## 2026-10-19 — v2 constraints

- We want to have an interface to Unleash that can potentially replace the UI but be AI agent friendly.
- We work in small increments because we learn from each as developers. Think 1 LOC–200 LOC range.
- Use the Unleash code review skill (`unleash-internal:code-review`) for development, as a self-check on each increment.
- Build a token efficient version.
- Light on the Unleash backend: with agents doing more than humans we don't want to bring the backend down.
- Never guess, ask clarifying questions.
- Save our decisions along the way (this file) so any dev can take over the driving of the implementation at any time. Stick to the original decision language closely and only make minor corrections.

## 2026-10-19 — Branch and layout

- Everything is new in v2. Start with an empty `v2` branch (orphan branch, nothing carried over from `main`).
- Decision log lives in `docs/decisions.md`; `CLAUDE.md` points to it.
- Increments are left uncommitted; the driver reviews and commits.

## 2026-10-19 — Toolchain

- Start minimal with just the MCP server (`@modelcontextprotocol/sdk` is the only dependency).
- Use Node standard tooling: it has a test runner (`node --test`) and it can run TypeScript nowadays (type stripping, so no build step, no `tsc`, no bundler). Requires Node 24+.

## 2026-10-19 — Type checking

- Add type checking from the get go: `tsc --noEmit` (`typescript` + `@types/node` as dev dependencies), run as part of `npm test` and on its own via `npm run typecheck`. Node still runs the source directly; `tsc` only checks. `erasableSyntaxOnly` keeps the code within what Node's type stripping can run.

## 2026-10-19 — Transports

- We are going to distribute this one as local (stdio) and remote (Streamable HTTP).
- We build remote first, since it's easier to maintain in the long term going this way.
