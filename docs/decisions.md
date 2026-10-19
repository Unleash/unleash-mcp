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

## 2026-10-19 — First tool: `release`

- The first tool is `release`. It hides the API operations behind one MCP tool. Releasing a feature means optionally creating a flag if it doesn't exist. If the flag exists, releasing means first interpreting whether we do percentage rollout, constraint based targeting, segment based targeting, or both. Sometimes a feature environment can have a value that we put inside a variant. If change requests are enabled we need to enable the environment and add the strategy to a change request.
- The calling agent does the interpretation. The tool takes structured targets (rollout percentage, constraints, segment names); each target becomes one `flexibleRollout` strategy, and strategies are ORed by Unleash ("50% of everyone plus beta testers" is two targets).
- Existing strategies in the environment are replaced: the call describes the desired end state.
- Values are strategy-level variants, so different targets can get different values.
- Change requests are detected by reading the project change request config first (one extra GET), not by falling back on 403.
- When the flag does not exist, we ask the user/agent whether to create the flag. When a segment name is not found, we ask whether we should create the segment. The tool replies with the question; a follow-up call with the explicit answer proceeds.
- When project or environment is missing or not found, the tool asks with the list: available projects (`getProjects`) or the project's environments (`getProjectEnvironments`). The lists are only fetched when needed.
- Constraints are checked against the context field's legal values (global and project-scoped context fields). When a value is outside the legal values the tool replies with the legal values and asks whether to pick one of them or add the value as a new legal value.
- Segments can be scoped to a project. The spec has no change request action for creating a segment (only `updateSegment` and `deleteSegment`), so a segment is created directly with `createSegment`, but the tool asks the user before creating it. The strategy that uses the segment still goes through the change request.
- We need pagination for the lists the tool asks from (projects, environments, segments, context fields). The Unleash API returns these lists whole, so paging is done in the tool: page size 20, a `page` input for the next page, and a `search` input that filters by substring. The question says how many matched and how to narrow down.
- Strategies are updated in place, not deleted and re-created. Existing strategies are paired with targets by position: the first N are updated (the update endpoint replaces the whole configuration), extra targets are added, surplus strategies are deleted last. The environment never has zero strategies, so Unleash never auto-disables it mid-release, strategy ids and history survive, and a partial failure leaves a usable state. Same for change requests with `updateStrategy`, `addStrategy`, `deleteStrategy`.
- The release tool only does releases. Changing context field legal values and creating or changing segments move to separate tools later. Release keeps the read-only checks (unknown context field, value outside legal values, unknown segment) because the API error does not list the valid options and an unknown context field passes silently; it replies with the valid options and stops, pointing to the future tool. It no longer takes `createSegments` or `addLegalValues`. Flag creation stays inside release, with confirmation.
- Decision making is modelled into the tool as union types, not thrown errors: `Decision = { kind: "choose"; id; message; options } | { kind: "confirm"; id; message }`. Each step returns a value or a decision. Decisions reach the user through MCP elicitation when the client supports it (the release continues in the same call); otherwise the decision is returned as the tool result and the agent calls again with `answers` keyed by decision id.
- Independent decisions are collected in one pass and returned together (`decisions: Decision[]`): project first (everything depends on it), then environment, flag confirmation, context fields, legal values and segments in the same pass. Reads are memoized per tool call so the elicitation loop does not repeat them after each answer.
- Remote stateless mode first: decisions always come back as the tool result and answers come back in the next call's `answers`. No server-initiated elicitation loop (it needs a session to correlate the reply). All state is in the input; reads are memoized only within one call. When the TypeScript SDK supports the 2026-07-28 input-required result, the same decisions are presented that way and the client does the retry.
- We don't want to over-engineer the solution. We want to support current MCP clients and open the door for standard evolution. Concretely: decisions as a plain tool result work on every client today; no asker/presenter abstraction until a second transport actually exists.
- Simplified after removing elicitation: no memoized reads (each call runs the release once), `choose` decisions are advice (the agent resends the corrected input), only `confirm` decisions have an answer channel (`confirm: ["createFlag"]`), checks are synchronous functions over fetched data that collect decisions into one list.
- When change requests are required the result is `pending_change_request`: the change is not applied, it sits in the user's change request. The API creates it as a Draft, so the result carries the change request's state and the next step (submitting it belongs to the change_requests tool, not to release).
- API failures are tool results, not thrown errors: result kind `failed` with the Unleash status and message, the writes already applied, and the note that calling again with the same input finishes the release (the input is an end state). The server marks it `isError` so the agent sees a failure it can recover from.
- Workflow and presentation are separate modules. The workflow (`release.ts`) takes business input and returns a result object with full option lists; the presenter (`present.ts`) turns a result plus the presentation inputs (`search`, `page`) into the MCP tool result (text today, structured content later). The server wires the two.
- Tool output is structured, not text: the workflow result is returned as `structuredContent` validated by a declared `outputSchema`, with option lists paged (`options`, `total`, `page`, `pages`). The text block carries the same JSON for clients that do not read structured content. No prose rendering.
