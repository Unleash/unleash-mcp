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

## 2026-10-19 — Unleash HTTP client

- Generate the HTTP client from the Unleash OpenAPI spec: generated types plus a thin typed fetch wrapper. Rejected: a hand-written client like `main` (types drift from the API), a full client generator (391 generated functions, mostly unused), and dynamic calls from the spec at runtime (pushes the whole API surface onto the agent).
- `openapi-typescript` generates types only (`src/unleash/api.d.ts`, checked in, no runtime code); `openapi-fetch` is the thin typed wrapper over Node's `fetch`. Unused endpoints cost nothing at runtime.
- The generated types are checked in; the spec itself (`src/unleash/openapi.json`, downloaded from `https://sandbox.getunleash.io/enterprise/docs/openapi.json`) is gitignored. Types are regenerated deliberately with `npm run spec:update`, not on install.
- `openapi-typescript` is a regular dev dependency. That pins the project's TypeScript to 5.x: the generator needs the TS compiler API that TypeScript 7 (the native port) no longer ships, and npm cannot nest a conflicting peer dependency. Revisit when the generator supports TypeScript 7.
- Generated types describe what Unleash returns; the token-efficient shaping of tool output stays hand-written on top.

## 2026-10-19 — Dev server in Claude Code

- Register the dev server with a checked-in project `.mcp.json` (name `unleash-dev`, runs `src/index.ts` directly). Secrets come from the gitignored `.env` via `node --env-file-if-exists`.
- Start with plain `claude`, which asks to approve the project server once. `claude --mcp-config .mcp.json --strict-mcp-config` skips that prompt.
