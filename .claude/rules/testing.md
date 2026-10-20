---
paths:
  - "**/*.test.ts"
  - "**/*.snapshot.json"
---

# Tests

- No hand-written fetch mocks. Tests run against Unleash through undici's `SnapshotAgent`: `npm test` replays checked-in snapshots, the `record-snapshots` skill re-records them.
- Sandbox fixtures: project `mcp-server`, predefined flag `mcp-flag`.
- Tests must be subsecond. Avoid network I/O, timers and process spawning.
- Recorded tests assert the tool output only; don't read Unleash state back.

Why: `docs/decisions.md` (Testing against Unleash).
