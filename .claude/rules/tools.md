---
paths:
  - "src/tools/**"
---

# MCP tools

- Each tool has its own directory (`src/tools/release/`), split into input schema, logic and output schema. Files and exports carry the tool name (`releaseInput.ts`, not `input.ts`). Shapes shared across tools (`failed.ts`, `target.ts`, `legalValue.ts`) sit in `src/tools/shared/`. A tool that sets who gets a flag in an environment (`release`, and the kill switch and experiment tools to come) plans and writes it through `src/tools/shared/rollout/`, keeping only its own input, output and audience planning.
- A success returns `structuredContent` and the same JSON as a text block; a failure returns a text block only.
- Keep output token efficient by returning minimal fields, shaped by hand on top of the generated Unleash types.
- Every union tags its success case with a `kind`; never a bare string next to result objects.
- A step (e.g. `flag.ts`) lives in its own file with its tests, owns the agent-facing results it can produce and returns only those (`Flags | Failed`, never the tool's whole result union), and reuses the shared ones (`failed.ts`; `target.ts`, the audience shape release takes and inspect returns). The tool function only composes steps. A tool that answers queries by kind (`inspect`, `search`) keeps each kind in its own directory (`src/tools/inspect/segment/`) with its test and snapshot; mappers shared across kinds sit in the tool's `shared/` (`src/tools/inspect/shared/usage.ts`).
- A read returns everything it gets cheaply. A part that costs Unleash real work (a scan, such as the usage of a context field) or many tokens (such as the diff of every change in an audit) is named in an `include` enum list on the query and left out unless named (`include: ['usage']`).
- Take a list of operations when the agent can name each part and each change is one Unleash call. Take an end state and diff it when parts have no agent-facing identity or rules span them.
- `search` and `inspect` rows are the dropdowns for agents: a filter or a command takes what those rows give (an id, a name) and never resolves it itself. A step never calls another step to look a reference up; the agent runs the lookup query first.
- A tool that writes (any tool not marked `readOnlyHint: true`) takes a strict input: every object is `z.strictObject`, including the shared shapes in `src/tools/shared/`. Outputs that use those shapes build them from Unleash data key by key, never passing an Unleash object through.
- Every input parameter's description says where to get its value from (e.g. `as a segments search returns it`, `as a context field inspect lists them`).
- A new tool gets a one-sentence outcome in `outcomes` (`src/server.ts`): what the user achieves with it, true to its schema.

Why: `docs/decisions.md` (Tool structure, Rollout engine shared by the use case tools, Unleash HTTP client, Tool layering, End state or operations, Opt-in parts of a read, Audit diff, Search prepares the options, Inputs say where their values come from, Strict inputs for tools that write, Server instructions pick the tool).
