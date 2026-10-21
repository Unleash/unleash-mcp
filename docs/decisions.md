# v2 decisions

Why v2 is the way it is, in the words of the person who made each decision. To add one, use the `record-decision` skill.

## 2026-10-19 — v2 constraints

- We want to have an interface to Unleash that can potentially replace the UI but be AI agent friendly.
- We work in small increments because we learn from each as developers. Think 1 LOC–200 LOC range.
- Use the Unleash code review skill (`unleash-internal:code-review`) for development, as a self-check on each increment.
- Build a token efficient version.
- Light on the Unleash backend: with agents doing more than humans we don't want to bring the backend down.
- Never guess, ask clarifying questions.
- Save our decisions along the way so any dev can take over the driving of the implementation at any time.

## 2026-10-19 — Branch and layout

- Everything is new in v2. Start with an empty `v2` branch (orphan branch, nothing carried over from `main`).
- Increments are left uncommitted; the driver reviews and commits.

## 2026-10-19 — Toolchain

- Start minimal with just the MCP server (`@modelcontextprotocol/sdk` is the only dependency).
- Use Node standard tooling: it has a test runner (`node --test`) and it can run TypeScript nowadays (type stripping, so no build step, no bundler). Requires Node 24+.

## 2026-10-19 — Type checking

- Add type checking from the get go with `tsc --noEmit`. Node still runs the source directly; `tsc` only checks. `erasableSyntaxOnly` keeps the code within what Node's type stripping can run.

## 2026-10-19 — Transports

- We are going to distribute this one as local (stdio) and remote (Streamable HTTP).
- We build remote first, since it's easier to maintain in the long term going this way.

## 2026-10-19 — Unleash HTTP client

- Generate the HTTP client from the Unleash OpenAPI spec: generated types plus a thin typed fetch wrapper. Rejected: a hand-written client like `main` (types drift from the API), a full client generator (391 generated functions, mostly unused), and dynamic calls from the spec at runtime (pushes the whole API surface onto the agent).
- `openapi-typescript` generates types only (no runtime code); `openapi-fetch` is the thin typed wrapper over Node's `fetch`. Unused endpoints cost nothing at runtime.
- The generated types are checked in; the spec itself is gitignored. Types are regenerated deliberately, not on install.
- `openapi-typescript` pins the project's TypeScript to 5.x: the generator needs the TS compiler API that TypeScript 7 (the native port) no longer ships. Revisit when the generator supports TypeScript 7.
- Generated types describe what Unleash returns; the token-efficient shaping of tool output stays hand-written on top.

## 2026-10-19 — Dev server in Claude Code

- Register the dev server with a checked-in project `.mcp.json`. Secrets come from the gitignored `.env`.

## 2026-10-19 — Tool structure

- Each tool is split into input schema, logic and output schema. Files and exports carry the tool name, not generic names like `input.ts`: with multiple tools, generic names make searching difficult.
- Tool output is structured, not text. For now only `structuredContent` is returned, no text block; add one back if a client we care about does not show the model structured content.
- Tools speak in outcomes, not Unleash internals: terms like strategies, ids and variants stay hidden from the agent, in outputs and errors alike.

## 2026-10-20 — Testing against Unleash

- We will not maintain manual fetch mocks. We use undici's `SnapshotAgent`: tests are recorded against the real Unleash sandbox and replayed from checked-in snapshots. Both use the same config as the server.
- Tests must be subsecond. Pay attention to anything that may slow them down, e.g. I/O over network, timers, process spawning.
- Snapshots are for happy path tests only. Error cases intercept the requests and reply as Unleash would, so the snapshot does not change when error coverage grows.
- For now, recorded tests assert the tool output only and do not read Unleash state back, to keep snapshots small. Reading back only proves anything while recording; revisit if a recording ever bakes in wrong behaviour.
- Test files that write to Unleash can use different flags, so files recording in parallel don't race on the same flag. Rejected: serializing the recording.

## 2026-10-20 — Release tool

- A flag might or might not exist. If it does not, then the release tool must create the flag.
- Supersedes the above: instead of assuming the flag is going to be created, ask the user for confirmation first. Port the spike's functionality, not its code (throwaway).
- The confirmation is a round-trip through the agent: the tool writes nothing and answers with a confirmation, the agent asks the user and calls again. It works with every client. Rejected: MCP elicitation (only clients that support it).
- The caller confirms with `createFlag: true`. Rejected: the spike's `confirm: ['createFlag']` list.
- The caller describes the end result of the release, and the tool figures it out in a stateless fashion: the targets replace what the environment had. Existing strategies are reused by position so their history survives.
- Each target has a required name. The agent knows why it is adding an audience, so it should say so; a generated label would only repeat the configuration. Rejected: an optional name, with or without a generated summary as fallback.
- `released` echoes the targets as applied, so the agent gets back the shape it sent. Rejected: one summary line per target.
- For now, problems are returned one at a time with `choose`/`confirm`. Not decided long-term. Rejected for now: the spike's list of all decisions at once.
- The environment is optional and checked against the project's enabled environments before any write. The tool always reads the project's environments, moreover because we'll want to present the options to the user. Rejected: reading them only when the environment is missing. With a single enabled environment, it is picked without asking, as with the project.
- Left out of scope for now, to tackle incrementally: segments in targets, context field and legal value checks, change requests, paging long option lists, flag type `release` on create, reporting already applied writes on failure, and the spike's open gaps (open draft change requests, no atomicity, concurrent edits, overwriting non gradual rollout strategies, dry run). See `docs/release-spike-report.md`.

## 2026-10-20 — Agent instructions

- No duplicated information, progressive disclosure: `docs/decisions.md` holds the why, `.claude/rules/` the what, `.claude/skills/` the procedures, `CLAUDE.md` only the always-on essentials.

## 2026-10-20 — Core views

- Always prefer Unleash's `view=core` query param where an endpoint offers it. Core views skip derived fields (counts, members, health) that MCP tools never consume, so they are cheaper for Unleash and smaller to read.

## 2026-10-21 — Release tool takes complete input

- The release tool is a command, not a query. Eliciting missing input (`choose`/`confirm`) polluted it with query responsibilities and made it super complex, and won't work long term. It now assumes all the input information is there: whatever the release needs (project, environment, segment ids) is required. Figuring out those inputs is the agent's job before it calls release.
- Supersedes, in the 2026-10-20 Release tool entry: the `createFlag` confirmation round-trip (a missing flag is always created), problems returned with `choose`/`confirm`, and the optional environment checked against the project's enabled environments (no check; Unleash's error comes back as `failed`).
- Segments are given by id. Supersedes "ids stay hidden from the agent" (Tool structure) for segments.
