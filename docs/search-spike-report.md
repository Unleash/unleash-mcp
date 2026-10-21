# Search tool spike

Throwaway spike of a read-only `search_spike` tool for two jobs: finding the values other tools need (e.g. segment ids for `release`), and answering questions about the instance (e.g. which flags project X has). Port its findings, not its code.

Code: `src/tools/searchSpikeInput.ts`, `searchSpikeOutput.ts`, `searchSpike.ts`, registered in `src/server.ts`. No tests.

## Shape

One tool. The input is a discriminated union on `kind` under `lookup`, the same way release's output puts its union under `result`, because MCP needs an object at the top level. The output is one union of the six result kinds plus the shared `failed`.

```jsonc
{ "lookup": { "kind": "segments", "project": "mcp-server", "query": "beta" } }
// -> { "result": { "kind": "segments", "segments": [{ "id": 76, "name": "Beta User IDs" }] } }
```

| kind            | input                         | Unleash request (1 per call)                     | output                                    |
| --------------- | ----------------------------- | ------------------------------------------------ | ----------------------------------------- |
| `projects`      | `query?`                      | `GET /api/admin/projects?view=core`, filtered here | `{ id, name }[]`                          |
| `environments`  | `project`                     | `GET /api/admin/environments/project/{id}`       | enabled names                             |
| `segments`      | `project`, `query?`           | `GET /api/admin/segments`, filtered here         | `{ id, name }[]`, global or owned by project |
| `flags`         | `project`, `query`            | `GET /api/admin/search/features?project=IS:{id}` | `{ name }[]`                              |
| `contextFields` | `query?`                      | `GET /api/admin/context`, filtered here          | `{ name, legalValues? }[]`                |
| `audiences`     | `project`, `flag`, `environment` | `GET /api/admin/projects/{id}/features/{flag}` | `{ enabled, targets: Target[] }`          |

All six were called through an MCP client against the sandbox and returned the expected shapes. An unknown flag in `audiences` came back as `failed` 404.

## Findings

- **`environments` filters on the wrong field.** `enabled` is the instance-wide switch; `visible` says whether the environment is added to the project. The sandbox has 6 enabled environments but `mcp-server` only has 2.
- **Flag search silently truncates.** Unleash returns 50 results by default and reports `total` (default project: 50 of 78; `query=a`: 50 of 64). The proposed output drops `total`, so the agent can't tell the list is cut off. This also affects the "what flags exist in project X" use case: `query` is required, so the agent can't list a project's flags at all.
- **Unfiltered lists are big.** The sandbox has 351 projects, 102 segments (61 owned by a project) and 93 context fields. With `query` left out, a lookup returns every row; at sandbox scale that's thousands of tokens. Filtering happens in our code, so Unleash still sends the whole list.
- **Some empty results look like successes.** `flags` with an unknown project returns 200 with no flags, and `audiences` with an unknown environment returns `enabled: false, targets: []`. To the agent, both look like "nothing there" rather than "wrong input".
- **`audiences` → `release` doesn't round-trip exactly.** The mapping in `toTarget` reverses release's `toStrategy`, but it loses information for anything release can't write:
  - only the first variant is kept;
  - stickiness and groupId are dropped;
  - disabled strategies are returned as active;
  - strategies other than `flexibleRollout` (e.g. `userWithId`) become a rollout with no constraints;
  - a strategy without a title gets its Unleash strategy name (e.g. `flexibleRollout`) as the target name, which leaks an internal term.

  Sending the result back to release would silently rewrite those strategies.
- **Context fields can belong to a project** (`contextFieldSchema.project`). The proposed input has no project, so project-scoped fields from other projects would show up. The sandbox has none, so this is untested.
- **`query` matching is a case-insensitive substring match** on id or name, done in our code. Flags use Unleash's own server-side search, so the two may behave differently.

## Open questions for the driver

1. One `search` tool with `lookup.kind`, or one tool per lookup? One tool keeps the tool list short. Separate tools give each lookup its own description and a flat input that's easier for the agent.
2. Should `flags` return `total` (or a `more` flag), and should `query` be optional so the agent can page through a project?
3. Should a `query` be required, or a result size capped, for projects, segments and context fields?
4. Should an unknown environment in `audiences` return `failed`? (An unknown flag already does.)
5. When `audiences` finds strategies release can't represent, should it return them as they are, flag them, or refuse?
6. Should `contextFields` take a project?
