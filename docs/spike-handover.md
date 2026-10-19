# Release tool spike: handover

The spike in `src/tools/` is throwaway code that proved the design. Rebuild it in small increments
(1–200 LOC each), using the Unleash code review skill as a self-check. `docs/decisions.md` is the
authoritative log; `docs/release-flows.md` shows the agent-facing behaviour. This file is the
condensed, current state (superseded decisions already resolved).

## What the tool is

`release`: one outcome-shaped tool. "This audience gets this feature in this environment."
Hides strategies, ids, variants and change requests. The calling agent interprets natural language;
the tool is deterministic.

Input: `project?`, `flag`, `environment?`, `targets[]` (each: `rollout?` 0–100 default 100,
`constraints?`, `segments?` by name, `value?` as a variant), `confirm?: ["createFlag"]`,
plus presentation inputs `search?`, `page?`.

Output (structured, `outputSchema`, same JSON in the text block), one of:
- `decisions`: nothing written. `choose` (message + paged options; agent fixes the input and calls
  again) or `confirm` (id; agent calls again with the id in `confirm`). All independent problems
  come back in one pass.
- `released`: flag, environment, one summary line per strategy.
- `pending_change_request`: change request id and state (API creates a Draft; submitting belongs
  to the change_requests tool).
- `failed` (`isError`): what Unleash said, which writes were already applied, retry converges.

## Effective decisions

1. Input is the desired end state. Strategies are updated in place by position: update first N,
   add extras, delete surplus last, enable last. Never zero strategies (Unleash auto-disables the
   environment when the last strategy is deleted). Ids and history survive.
2. Each target = one `flexibleRollout` strategy; targets are ORed. Parameters: `rollout`,
   `stickiness: default`, `groupId: <flag>`. `title` = summary line (shown in the UI).
3. Value = strategy-level variant: one variant, weight 1000, `weightType: variable`
   (Unleash rejects a lone `fix` variant).
4. Reads first (parallel after project is known), then pure checks, then writes.
   Checks: environment exists and enabled; context field exists (global + project endpoints,
   the project one returns only project-scoped fields); constraint values within legal values
   when the field has any; segment exists and is global or in this project.
5. Release never creates segments or legal values (separate tools later). It creates a missing
   flag (type `release`) after `confirm: ["createFlag"]`.
6. Change requests: read the project config first; if enabled for the environment, one POST with
   `updateStrategy` / `addStrategy` / `deleteStrategy` / `updateEnabled` actions. Flag creation
   is direct even then (same as Unleash's own import).
7. Missing project/environment: return the list (projects paged 20, `search`/`page`).
   A single project is used without asking.
8. No server-initiated elicitation, no server state between calls (remote stateless first).
   Decisions are plain results; the 2026-07-28 spec's input-required result has the same shape,
   adopt it when the TypeScript SDK ships it (v2.3.1 does not).
9. Workflow (`release.ts`) and presentation (`present.ts`) are separate; server wires them.
10. API failures are results, not exceptions; every call is labelled ("add strategy "50%"").
11. Keep it simple: no memoization, no transport abstraction, nothing without a second use.

## API operations used

projects, environments/project/{id}, features/{name}/environments/{env} (404 = missing flag),
context + projects/{id}/context, segments, change-requests/config, POST features,
PUT/POST/DELETE strategies, POST environments/{env}/on, POST change-requests.
Not needed: import (atomic but delete+recreate, refused with a pending draft), bulk endpoints
(none for strategies), set-sort-order.

## Verified against the sandbox (project `mateuszai`, token in gitignored `.env`)

All four result kinds, batched decisions, paging, in-place updates keeping ids, change request
path (draft 1680), legal value check, segment by name, variant payload. Leftovers to clean up:
flag `mcp-v2-spike`, segment 165 `mcp-v2-beta`, legal value `gouda` on context field `cheese`,
draft change request 1680 in development.

## Known gaps (not implemented, decide before or during increments)

- Pending draft change requests are invisible when reading current state; repeated releases
  append to the same draft. Unleash's own import refuses in that case.
- No atomicity across several strategies (API has no bulk write). Mitigated by ordering + retry.
  A bulk "set strategies for a feature environment" endpoint would be the real fix (backend ask).
- No concurrency protection between read and writes (no ETag/version on strategies).
- Existing strategies of other types (custom, release-plan milestones) are overwritten blindly.
- Dry run (`dry_run` in the tool table): return the planned updates/adds/deletes without writing.
- Tool annotations (`readOnlyHint` etc.) not set.
- Structured output doubles tokens (JSON in text block too); shrink the text block if it matters.

## Suggested increments

1. Client + server wiring, `release` with project/environment/flag and a single `rollout` target,
   direct path, structured output. Fake-fetch test harness (route matchers recording calls).
2. In-place update/add/delete ordering + enable.
3. Decisions: missing project/environment with paging; missing flag confirm + create.
4. Constraints with context field and legal value checks.
5. Segments by name.
6. Values as strategy variants.
7. Change request path + `pending_change_request`.
8. `failed` results with applied writes.
9. Dry run; pending draft detection.
