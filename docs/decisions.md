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

- pnpm instead of npm: a 7-day `minimumReleaseAge` cooldown, and dependency install scripts are blocked by default. The shared npm release workflow installs with pnpm too.
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
- A result lists every target in the order Unleash checks them, the active milestone's first and then the environment's, as inspect lists each, with its name when it has one and whether it matched, missed, is unknown or is disabled. An unknown one also names its `strategy`, the one only SDKs can check, since that is what an agent looks for in the code. Rejected: naming an unnamed target by its Unleash strategy type (`flexibleRollout`), which is misleading and not unique, and listing only the first match, which hides that another target would still let the user in, and an id or position per target, which no other tool takes.
- The value is the one the code receives, once per result. Rejected: a value on every matched target, since only the first is served.
- Every target explains itself: a matched or unknown one lists its segments and constraints, a missed one only those that kept the context out, in the target's own `segments` and `constraints` fields. Segments come with their name, which the playground gives for free, so the agent can tell people which segment it was. Rejected: segment ids only, which mean nothing to people and cost a segments search, and one list tagged by kind, which repeats the kind on every entry.
- A segment comes by id and name only: a segment inspect takes the id and shows its constraints, and a segment can hold up to 1000 values by default. A target's own constraints have no id another tool takes, so they come in full. Rejected: a segment's constraints in the result, even as an opt-in.

## 2026-10-26 — A target bundles who, how many and what

- Segments and constraints say who, and all of them must match. A target bundles that with how many (rollout) and what they get (values); separate targets are alternatives. Its name says why the audience exists. Rejected: a target being just a segment or a constraint, which has nowhere to put a rollout or values, nor a segment and a constraint together.

## 2026-10-26 — Change request links

- Every change request result carries a `url` to the change request in the Unleash UI, so people can open it instead of looking it up by number.
- The link is built from our `UNLEASH_BASE_URL`, the address the user configured. Rejected: Unleash's own `unleashUrl` from `ui-config`, which self-hosted instances that never set it report as `http://localhost:4242`.

## 2026-10-26 — `manage_flag` tool

- `flag_lifecycle` is renamed `manage_flag`: everything about a flag itself (defining it, its parent, its lifecycle, archive, revive and delete). Who gets the feature stays in `release`. Rejected: putting the parent in `configure` or in a tool of its own.

## 2026-10-26 — Release through a release template

- `release` takes a release template id, `template`, to release a flag through the template's milestones instead of targets built from scratch.
- `targets` and `template` are mutually exclusive. The template replaces the environment's audiences, as targets do, so the end state is just the plan. Rejected: a template next to targets, and a template that keeps the existing strategies.
- Both sit under `audience`, a `oneOf` of `{ targets }` and `{ template }`, so agents see that exactly one is required. Rejected: top-level `targets` and `template` with a refine (enforced, but invisible in the schema), and a `oneOf` at the root (MCP needs an object root, and the SDK then advertises an empty schema).
- The template is always applied, even when the same one is already on the flag: Unleash replaces the plan and starts it again from the first milestone. Rejected: skipping a template that is already applied.
- `released` echoes the template id with a plan summary: the plan name and the milestone being served. Rejected: the id only. `pending_change_request` echoes the id only, since no plan exists until the change request is applied.

## 2026-10-26 — A disabled target reads as disabled

- SDKs never get a disabled target, so it neither turns the feature on nor makes it unknown. Rejected: passing on Unleash's unknown for it, which says an SDK may still serve the feature, and leaving disabled targets out, which hides a target inspect lists.

## 2026-10-26 — Change request review

- People review change requests in the Unleash UI, not through the MCP: approval stays a human step, and we don't duplicate the UI.
- `inspect` of a flag lists its pending change requests with their state, environment and link, so an agent knows a change is waiting instead of treating it as applied or requesting it again. What each one changes is hidden for now: describing it meant translating Unleash's change actions into change types the UI doesn't have.

## 2026-10-26 — Release template search

- `search` finds release templates so an agent can get the id `release` takes. Rows are the id and the name only: templates carry a lot we don't want to disclose yet, such as the strategies underneath.
- With a project, the search lists the templates usable there, the project's own and the global ones (the project endpoint is beta); without, the global ones only. Rejected: the global list only, which hides project templates.
- The sandbox's release template limit was raised, so template tests are recorded. This supersedes the stubbed project template test in "Release templates in configure".

## 2026-10-26 — A target's rollout explains it too

- `matchedBy` names the rollout when it is under 100. `missedBy` names it only when every segment and constraint let the context in, since only then did the rollout keep it out.
- The rollout comes with its `stickiness`, the context field that groups people into the same side of it, so "not in the 80%" reads as "this userId falls outside the 80%". It is the field Unleash actually used: `default` means userId, then sessionId, then random, and means nothing to someone new to Unleash. Rejected: reporting `default` as is.
- When the context lacks that field, Unleash misses the target before it checks the percentage, so `missedBy` names the field alone. Naming the percentage would send an agent to change it.
- `random` is a new draw on every call, so the result can change. The result still reads on or off. Rejected: a new result for it.
- No bucket number (where the context lands, such as 94 of 100): Unleash doesn't return it, so we would copy its hashing and add a dependency.
- A rollout of 100 never shows: it lets everyone in, so it explains no match. Rejected: always showing the rollout as inspect does.

## 2026-10-26 — An off feature names what blocks it

- An off result lists what turns the feature off whatever its targets say, `blockedBy: ['environment', 'parent']`, because agents couldn't explain an off feature next to a matched target. Its targets still show what happens once nothing blocks it.
- It maps the two answers Unleash gives and copies none of its rules. If Unleash adds a blocker, we add a value.
- `parent` doesn't name the parent flag: the playground doesn't return it, and an extra request per query isn't cheap. The agent inspects the flag instead.

## 2026-10-26 — Release plan and milestone ids in inspect

- `inspect` shows the id of an environment's release plan and of each milestone. The agent needs both to start a milestone. Release plan and milestone ids are shown to the agent, the same exception as segment, change request and release template ids. Rejected: the milestone id only.

## 2026-10-26 — Start a release plan milestone

- `release` takes a third audience, `{ releasePlan, milestone }`, with the ids inspect shows, to move a flag's release plan to any of its milestones. Rejected: a milestone next to `template` (a fresh plan's milestone ids are unknown beforehand), and a separate tool.
- Applying a template still starts its first milestone: Unleash does it when it creates the plan, and that is acceptable.
- Where change requests are required, the start goes into the release's change request (`startMilestone`), as the other audiences do.

## 2026-10-27 — Audit tool load on Unleash

- Every `audit` search has a date window of at most 31 days, so reading the event log stays cheap. It defaults to yesterday and today in UTC, which covers the last 24 hours in any time zone.
- Pages are a fixed 25 changes; agents narrow the filters rather than page far.
- No free-text search and no group id filter: Unleash scans the whole event log for both.
- No `createdBy` filter yet: the only lookup that lists everyone who made changes, Unleash's event creators, scans the whole event log too.

## 2026-10-27 — Projects in configure

- `configure` creates projects. Only create for now.
- Create takes every setting Unleash's create takes: name, description, mode, default stickiness, environments and change request environments. Rejected: name and description only, and leaving out mode and stickiness.
- Unleash picks the id (the body's `id` is deprecated), so a created project answers with its `id` next to its `name`, as release templates do.

## 2026-10-27 — Audit diff

- `microdiff` computes the diff. Rejected: our own.
- The diff leaves out empty values and ids, unlike the UI's, which shows everything: agents read fewer tokens and don't take an empty value for a cleared one. Rejected: matching the UI.

## 2026-10-27 — send_feedback consent

- `send_feedback` is listed only when the user opts in with `UNLEASH_MCP_SEND_FEEDBACK=true`: safe by default, since reports go to Unleash's production instance. No consent file and no prompt for now. Rejected: always listed with no consent, and an agent round trip (bigger than a walking skeleton).
- Supersedes the above: `send_feedback` asks for consent through v1's elicitation prompt and keeps the answer in v1's consent file, so the user is asked once. `UNLEASH_MCP_SEND_FEEDBACK` still decides without asking: `true` grants, `false` leaves the tool out. `UNLEASH_MCP_CONFIG_DIR` locates the file, as in v1.
- Reports go to the instance in `UNLEASH_FEEDBACK_URL`, with no default: Unleash's feedback instance is internal and private. Unset, `send_feedback` fails.

## 2026-10-27 — No flag deletion for now

- `manage_flag` doesn't delete flags in this iteration, to prevent irreversible changes: an archived flag can be revived, a deleted one can't. The code and its tests stay for when it comes back. Supersedes delete in "`manage_flag` tool".

## 2026-10-27 — send_feedback reports

- A report can name the tool that fell short, from an enum of the registered tools. Rejected: v1's regex on the tool name.
- Fields a report doesn't need are left out, not sent as `null`. Rejected: v1's `null` for left-out fields.
- A report names the client the agent runs in, as it named itself when it connected. No switch to turn that off: users already opt in to feedback as a whole. Rejected: v1's `UNLEASH_MCP_CLIENT_ATTRIBUTION`.
- When Unleash can't be reached, a report fails as the shared `failed` with status 0 and name `NetworkError`. Rejected: a separate `unreachable` kind.
- A report waits at most 10 s, so a hanging connection doesn't block the agent. v1 had no timeout.

## 2026-10-27 — Published package is built

The published package ships JavaScript built by `tsc`: Node won't strip types inside `node_modules`. Development and tests still run the `.ts`. Supersedes "no build step" in "Toolchain". Rejected: consumers compiling our source.

## 2026-10-27 — Remote server

- The remote server is a handler Unleash mounts (`@unleash/mcp/remote`), not a standalone server. Unleash already authenticates the user, so the handler acts as the caller with the auth Unleash forwards.
- Stateless: every request gets its own server, so nothing is shared between users.
- Unleash decides the feedback consent, from its admin settings, and must always pass it.

## 2026-10-27 — Server instructions pick the tool

- The server sends instructions: guidance on how to pick each tool, a single sentence per tool, in terms of outcomes and not operations. Clients that defer tools show the agent only tool names and these instructions, and in evals the agent loaded every v2 tool because it wasn't sure which it needed, while v1 was better at picking.
- Each sentence also opens the tool's description, from one record, so the two never drift.
- A sentence only claims what the tool can do and stays general, never shaped after one eval task, to avoid overfitting.
- Rejected: telling the agent to load a tool only when the next step needs it. On Haiku it loaded no fewer tools and used more tokens.

## 2026-10-27 — Linter

- Biome, with the same rules as `main`. Imports are sorted.
- The formatter is off for now: turning it on reformats nearly every file, so it waits for a moment with no other v2 work in flight.

## 2026-10-27 — Release refuses targets that are not gradual rollouts

- We only support the flexible (gradual) rollout. If the environment has any other kind of target, such as user ids or IPs, a change to its targets is refused, with whichever audience, and the user changes it in the Unleash UI. Release writes only gradual rollouts, so inspecting then releasing turned `userWithId` alice,bob into everyone and still said `released`. Rejected: leaving those targets untouched.
- Unleash's legacy `default` strategy is accepted: it serves everyone, as a 100% gradual rollout does, so rewriting it as one changes nothing.
- Supersedes "overwriting non gradual rollout strategies" in the 2026-10-20 out-of-scope list.

## 2026-10-27 — Successes as structured content and text

- A success returns `structuredContent` and the same JSON as a text block, as the spec says it SHOULD. Antigravity, Devin and Cursor show the model only text blocks, so a success with `structuredContent` only reached their models empty. Codex and Copilot then show the model both copies, Claude Code only the structured one.
- Failures stay text only. Every client we measured shows the model the text of a failure carrying both, so structured failures would only help code calling the MCP directly, and we know of no such users. Rejected: failures carrying both.
- Supersedes, in the 2026-10-21 Failures as text entry, "Rejected: a text block on every result" for successes.

## 2026-10-28 — Rollout engine shared by the use case tools

- Releasing software, kill switching and A/B test splits are separate enough use cases to justify separate top-level tools, despite all of them using similar, if not identical, setup under the hood. For experiments Unleash only does the split, not checking the results.
- So the rollout engine is shared code, not part of `release`: planning an environment's end state, the direct writes, the change request for an environment, applying a template and starting a milestone live in `src/tools/shared/rollout/`, and each tool keeps only its own input, output and planning of its audience.
- Release plans stay in the shared engine, even though kill switches don't use them. Rejected: moving them into `release`, which spread the order of the writes over too many places.

## 2026-10-28 — Kill switch tool

- A missing switch is created behind the scenes as a permanent `kill-switch` flag. Encourage a negated name like `disable-payments`, but don't enforce it.
- Same as release: one environment per call, same change request behaviour. Targets default to everyone, to prevent overspecifying.
- Skip changing the type of an existing flag for now, though people often turn releases into permanent kill switches.

## 2026-10-28 — Strict inputs for tools that write

- Tools that write refuse keys they don't know, at any level. A dropped key reports success for something the agent didn't ask for, e.g. release's audience sent to kill_switch turns the switch on for everyone. A refusal names the key, so the agent fixes the call.
- Rejected: Postel's law (be liberal in what you accept). It keeps old clients working, but agents read the schema every session, so there are none; it would only hide their mistakes.
- The shared shapes are strict too, so an output using them fails on an extra key instead of dropping it. Read tools still drop unknown keys for now, except in the shared shapes they reuse, such as search's tag filter.
- Rejected for now: lenient outputs, though the API may add new fields over time. Outputs map Unleash data key by key, so new fields don't reach them, and clients still get closed output schemas.

## 2026-10-28 — Formatter

- Biome formats the code, at 120 characters a line: fewer changes than 100. Supersedes "the formatter is off for now" (Linter).

## 2026-10-28 — Stickiness on targets

- Stickiness is set per target, on the shared target shape, so release, kill_switch and the experiment tool take it alike. Unleash requires it on each variant too, so the variants get the target's; values never take their own.
- Left out, a target sticks on Unleash's `default`. The project's default stickiness is on `inspect project` for the agent to pass along. Rejected: the tools reading the project's default themselves, which costs a request on every call and puts a lookup inside a command.
- Outputs and `inspect` always show a target's stickiness, so a target round-trips unchanged.

## 2026-10-28 — Experiment tool

- `experiment` is release with targets only, where every target names the values it gets: split within an audience by share, or one value per audience as control and treatment groups. Rejected: at least two values per target, which rules out one value per audience; `ab_test` and `configure_experiments` as names; a single-audience shape with top-level values.
- A missing flag is created as an `experiment` flag reporting impression data, with an opt-out; an existing flag keeps its type and impression setting.
- Changing shares or stickiness mid-run is allowed and moves users between values; the input says so rather than refusing.
- How an experiment ends, and shipping the winner, is not part of the tool.

## 2026-10-29 — A missing flag is always created

- Release, kill switch and experiment create a missing flag in either state and write its targets, as the kill switch already did. Supersedes "Only turning on creates a missing flag" (2026-10-23 Release turns a flag on or off).

## 2026-10-29 — Project update in configure

- `configure` changes projects with `action: 'update'`, keyed on the project id. Supersedes "Only create for now" in "Projects in configure". Rejected: an upsert, since Unleash picks project ids, so it could only tell create from update by whether an id is given.
- Update covers name, description, mode, default stickiness, environments and change request environments. Left out settings stay.
- Environments are an end state, diffed against the project overview (one read), as inspect lists them. Change request environments are per-environment operations, the ones left out stay: nothing shows their current config, so the agent can't send back what to keep.
- An update stops at the first refused write; the writes before it stay.
- Update sends the mode to the project settings endpoint, one more request only when a mode is given: Unleash's project update takes a mode and answers 200 but doesn't save it. Create saves it.
- Inspect project returns the name, description and mode, so an agent can check what an update wrote. They come in the overview it already reads, and the overview doesn't deprecate the description, unlike the projects list search reads.
