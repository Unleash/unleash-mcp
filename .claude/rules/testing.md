---
paths:
  - "**/*.test.ts"
  - "**/*.snapshot.json"
---

# Tests

- No hand-written fetch mocks. Tests run against Unleash through undici's `SnapshotAgent`: `npm test` replays checked-in snapshots, the `record-snapshots` skill re-records them.
- Sandbox fixtures: project `mcp-server` with flag naming pattern `^mcp-[a-z-]+$` (example `mcp-flag`, description `mcp, dash, lowercase words`), predefined flag `mcp-flag`.
- Test files that write to Unleash use their own flag (e.g. `mcp-server-flag` in `server.test.ts`): files record in parallel.
- Tests must be subsecond. Avoid network I/O, timers and process spawning.
- Recorded tests assert the tool output only; don't read Unleash state back.
- Setup and teardown use the `admin` client from `createRecordedClient`; the code under test uses `unleash`. Change requests are cancelled by their author, `unleash`.

Why: `docs/decisions.md` (Testing against Unleash, Admin client for test setup and teardown).
