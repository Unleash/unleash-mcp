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

## 2026-10-21 — Failures as text

- A failed tool result is returned as a text block only; successes stay `structuredContent` only. Claude Code doesn't show the model `structuredContent` on an error result, only "Unknown error", so Unleash's reasons never reached the agent. Rejected: a text block on every result, and failures carrying both.
- Supersedes "only `structuredContent` is returned, no text block" (Tool structure) for failures.

## 2026-10-21 — Release in environments with change requests

- The release tool must work in environments with change requests enabled. There, the whole release goes into one change request and the tool returns `pending_change_request` with the change request's id and state. The flag is still created directly, as in Unleash's own import. Supersedes "change requests" in the 2026-10-20 out-of-scope list.
- Change request ids are shown to the agent, the same exception as segment ids. Rejected: an outcome-only result without the id.
- Tell Enterprise apart the way the UI does (`useUiConfig`): `ui-config`'s `versionInfo.current.enterprise` set and `environment` not Pro. Only Enterprise reads the change request config. Rejected: treating a 404 on the change request config as no change requests.
- The edition is remembered in the `createRelease(unleash)` closure after the first read, to keep requests to Unleash down. Rejected: reading `ui-config` on every release.
- Submitting the change request for review is the last step of a release. Unleash adds the release to the user's open draft, if any, and the whole draft is submitted, other changes included. Rejected: leaving a draft with other changes unsubmitted.

## 2026-10-21 — Admin client for test setup and teardown

- Setup and teardown would be done by an admin in the real world, so tests use a second Unleash client with its own PAT (`UNLEASH_ADMIN_PAT`) for them, instead of giving the user under test more permissions.
- Exception: a submitted change request can't be deleted, only cancelled, and only by its author, so the user under test cancels the ones its releases create. Cancelled change requests stay in the sandbox.

## 2026-10-21 — Release splits an audience across values

- A target takes `values`, replacing the single `value`, so an audience can be split across several values. Rejected: keeping `value` next to `values` (two ways to say one thing).
- A value's `share` is an optional percentage (0–100), like `rollout`. Values without one split what is left evenly. Rejected: decimal percentages and Unleash's 0–1000 weights.
- The result echoes the values as sent, not the shares Unleash resolves. Rejected: echoing the resolved shares, which means copying Unleash's weight logic or extra reads.
- Left out for now: value stickiness (stays `default`) and Unleash's deprecated per-environment values.

## 2026-10-22 — Configure tool

- `configure` handles simple CRUD resources: create, update, delete a segment, context field, legal value, tag type; more added as needed.
- Shaped like `search`: a list of changes, one result per change.
- A change names its resource in `kind` and its operation in `action`. Rejected: one kind per operation (`create_tag_type`) and an end state the tool upserts.
- Updating a context field replaces it, like Unleash's PUT: properties left out are reset. Rejected: a partial update that reads the field and merges (2 requests).
- Project context fields are supported, after the global ones.
- Left out of `configure`: reading context fields and their usage (reading a context field is an `inspect` query), validating a name (create already answers it) and `sortOrder` (Unleash's PUT resets it to 0).
- Adding a legal value is `action: 'create'`, although Unleash overwrites the description of a value that exists. Rejected: `update`, and both mapping to the same call.
- A legal value result names its `field` and `value`, mirroring the input. Rejected: `name` for the value.
- Every result names the change it answers, failures included: `resource`, `action` and its target (`name`, or `field` and `value`). Matching by position alone is error prone in a batch. `kind` is `applied` or `failed`, with Unleash's answer under `error`. Supersedes the `created`/`updated`/`deleted` kinds. Rejected: a caller-chosen id per change, and echoing the target without `action`. Only `configure` changes; `release` and `search` keep the shared `failed`.

## 2026-10-22 — End state or operations

- `release` and `configure` keep different shapes because the problems differ. Rejected: one shape for every tool.
- A tool takes a list of operations when the agent can name each part it changes and each change is one Unleash call with no rules across parts (`configure`). An end state would cost reads to tell create from update and still needs operations to delete.
- A tool takes an end state and computes the diff when the parts have no identity the agent can name, or rules span them (`release`: hidden strategy ids, order, never zero strategies, one change request).
- Target names are not identity: they are not unique, and order and the change request still need the whole set. So `release` keeps replacing all targets.

## 2026-10-22 — Tests set up their own data

- Tests recreate everything they need in setup and remove it in teardown; the sandbox holds only the project `mcp-server`. Rejected: depending on predefined flags and settings in the sandbox, which drift and break recordings.
- Setup copes with what a failed recording leaves behind (a flag with children, a segment with the same name), so a recording never needs a manual sandbox cleanup.
- Over time, setup should go through the server's own tools instead of the admin API.

## 2026-10-22 — Snapshots hold only what matters

- Snapshots leave out response headers that change on every recording (`date`, `etag`, `ratelimit-*`), so a re-recording diffs less noise.
- Response bodies are kept verbatim even though they carry ids and timestamps: they are the truth about the API, and ids echo into later request URLs, so normalising them would break replay.
- undici's per-entry recording timestamp stays: stripping it needs code that rewrites the snapshot file, and one line per exchange is easy to skim past.

## 2026-10-22 — Opt-in parts of a read

- A read returns everything it gets cheaply. Parts that cost Unleash real work, such as the usage of a context field (a scan of every strategy), are named in an `include` enum list on the query and left out unless named. Rejected: a boolean per part (doesn't scale), always fetching usage, and a GraphQL-style selection of the response shape (the output schema can't follow it, absence stops meaning anything, and the savings stop at request boundaries anyway).

## 2026-10-22 — Search tool

- Search fetches all segments for now and returns every match, without a limit or a total: most people don't have that many segments, and letting the agent do the filtering and mapping is fine for now. The rows carry scope, author, creation date and usage counts, and the tool tells the agent to search all and filter itself. Rejected for now: a default limit with a total, and typed filters applied on our side, since Unleash's segments list offers none.
- Context field search lets Unleash scope the list, as its UI does: a project's fields with the global ones included, or the global ones with every project's included. The name match stays on our side. Rows carry the usage counts the list gives for free; legal values stay on `inspect`.
- Project search matches the query on the id or the name on our side, over the core view. Rows are id, name and creation date: `archivedAt` is left off because the list excludes archived projects unless asked, and `description` because Unleash deprecates it.
- Tag type and tag search match on our side, since neither list filters; tags of one type come from Unleash's by-type list. Tag type rows leave off icon and colour, which an agent doesn't act on.

## 2026-10-22 — Release templates in configure

- `configure` creates release templates, global or in a project (the project endpoint is beta). Only create for now.
- A milestone takes `targets`, the audience shape `release` takes. Rejected: Unleash strategies as they are.
- A milestone can advance on its own (`advance`: after minutes or after exposures).
- A created template answers with its `id` next to its `name`. Release template ids are shown to the agent, the same exception as segment and change request ids. Rejected: the name only.
- The project template test is stubbed, not recorded: the sandbox's limit of 10 release templates leaves room for only one of ours. Rejected: freeing slots in the sandbox, and creating one template at a time.

## 2026-10-23 — Flag search

- Flag search uses Unleash's search endpoint, paged with offset, limit and total, so Unleash does the matching and paging. Rejected for now: the project features list with `view=core`, which is far cheaper for Unleash but has no paging.
- The search endpoint is Unleash's heaviest flag read (checked in its source: the ranking joins every matching flag before the page is cut, and no core view exists). Accepted for now; the fix is a core view on the search endpoint in Unleash.
- Only project and query filters for now; typed filters and sorting wait for a use case. Rows are a summary; strategies stay on `inspect`.
- A step returns only the results it can produce (`Flags | Failed`), not the tool's whole result union: the compiler then checks each kind's output and tests need no casts. Rejected: the spike's habit of returning the union everywhere.
- No favorites filter: favorites belong to the human user behind the token, not to an agent.

## 2026-10-23 — Search prepares the options

- `search` and `inspect` prepare the data options for the commands and queries that take filters or references: they are the dropdowns of the UI, but for agents. A command or filtered query takes what those rows give (an id, a name) and never resolves it itself; the agent runs the lookup query first. Rejected: a step calling another step to resolve a reference, which repeats a request the agent already made.

## 2026-10-23 — Node versions

- Pin Node 26 for development, but the minimum supported stays 24. The snapshots replay only on the Node major they were recorded on, because undici hashes the request headers and `accept-encoding` changes between majors. Node 24 is in maintenance but supported until 2028-04-30; Node 26 becomes LTS on 2026-10-28. Rejected for now: raising `engines` to 26, which buys the code nothing.

## 2026-10-23 — Test speed

- Type checking dominated `npm test`, because of the generated Unleash types, not our code. Make `tsc` incremental so repeated runs skip what did not change.

## 2026-10-23 — pnpm

- pnpm instead of npm, the same as v1: a 7-day `minimumReleaseAge` cooldown, and dependency install scripts are blocked by default. The shared npm release workflow installs with pnpm too.
- Three versions npm locked this week are exempt from the cooldown until 2026-10-27, so the lockfile stays the one the tests passed on. Rejected: resolving again, which moves every version.

## 2026-10-23 — Release turns a flag on or off

- `release` must let an agent turn a feature off ("turn the awesome-new-checkout feature off"), within the end-state design: `flag` becomes `{ name, state: 'on' | 'off' }`. Rejected: a flat `flagName` and `flagState`, and a top-level `state` next to a `flag` string.
- `targets` stays required for both states, so every call describes the full end state. Rejected: optional targets that keep the environment's audiences.
- Turning off a missing flag fails with Unleash's 404. Only turning on creates a missing flag. Rejected: creating it, off. Supersedes "a missing flag is always created" (2026-10-21 Release tool takes complete input).

## 2026-10-23 — Segments in configure

- `configure` creates, updates and deletes segments. Reading them stays on `inspect` and `search`.
- Update and delete name the segment by id, as release targets do; create answers with the new id. Rejected: by name, which needs a list read to resolve it.
- Updating a segment replaces it, like Unleash's PUT: name and constraints are required, a left out project makes it global, a left out description stays. Rejected: a partial update that reads and merges (2 requests).
- Updating or deleting a segment in a project with change requests goes into a change request, submitted for review, and answers `pending_change_request` with its id and state. Supersedes "change requests for project segments are left out for now".
- Delete takes an optional project, as update does. Rejected: reading the segment first (one more request per delete), and writing directly then falling back on Unleash's refusal (depends on its error text).
- Whether a project needs change requests is checked the way the release tool does it (edition, then the project's change request config). Its environment is the one the Unleash UI picks: a production one first.

## 2026-10-23 — Single-flag playground route in the generated client

- The single-flag playground route is beta from Unleash 8.3.0, but `main` still reports 8.2.0, so the sandbox spec leaves it out. I copied just that route in from a local Unleash in dev mode, which serves alpha routes. Rejected: the whole local spec, which reorders and drops routes, and faking the beta version as 8.2.
- Don't regenerate the spec until the sandbox is on 8.3.0, or the route drops out.

## 2026-10-23 — Evaluate defaults appName to unleash-mcp

- Unleash needs an `appName` to evaluate, and someone testing a flag from a chat agent won't know their app's name, so `evaluate` defaults it to `unleash-mcp`. People can target `unleash-mcp` with an app name rule, apart from their real apps. Rejected: requiring it, and the UI playground's `playground`.

## 2026-10-23 — Deleting a resource in use

- Deleting a resource in use is refused where it changes how flags behave (context fields, segments): Unleash refuses those itself and the refusal is passed through. Deletes that only remove labels (tags, tag types) cascade, as in the UI; the search rows carry the usage, so the agent checks and asks before.

## 2026-10-24 — Inputs say where their values come from

- Every input parameter, and every tool description, says where to get its value from: the `search` or `inspect` result that gives it. Agents then look values up before writing. Prompted by real usage of `configure`: a constraint value that was not a legal value became a change request Unleash could not apply, and a change request id was sent as a segment id.

## 2026-10-26 — Evaluate one flag per query

- `evaluate` only ever hits the single-flag playground endpoint. A query names no project: flag names are unique and the endpoint resolves the project, so a project would be a second source of truth. Rejected: the project-wide advanced playground, a really heavy endpoint that is very taxing on the Unleash server.
- It takes a list of queries, like `inspect`: each query is one flag in one environment, with one context.
- Results carry `flag` and `environment`, so a failure reads on its own. Order is what tells apart queries that differ only in context. Rejected: echoing the context back in every result, which costs tokens.
- Unknown is its own result next to on and off: only a target Unleash cannot evaluate on the server, such as a custom strategy, could have turned the feature on, and SDKs may still serve it. An environment that is off or an unsatisfied parent still answers off. Rejected: answering off, which tells an agent a feature is off when an SDK may still serve it.
- A result lists every target in the order Unleash checks them, the active milestone's first and then the environment's, as inspect lists each, with its name when it has one and whether it matched, missed or is unknown. Rejected: naming an unnamed target by its Unleash strategy type (`flexibleRollout`), which is misleading and not unique, and listing only the first match, which hides that another target would still let the user in, and an id or position per target, which no other tool takes.
- The value is the one the code receives, once per result. Rejected: a value on every matched target, since only the first is served.

## 2026-10-26 — A target bundles who, how many and what

- Segments and constraints say who, and all of them must match. A target bundles that with how many (rollout) and what they get (values); separate targets are alternatives. Its name says why the audience exists. Rejected: a target being just a segment or a constraint, which has nowhere to put a rollout or values, nor a segment and a constraint together.
