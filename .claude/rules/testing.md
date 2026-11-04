---
paths:
  - "**/*.test.ts"
  - "**/*.snapshot.json"
---

# Tests

- No hand-written fetch mocks. Tests run against Unleash through undici's `SnapshotAgent`: `pnpm test` replays checked-in snapshots, the `record-snapshots` skill re-records them.
- Snapshots leave out churning response headers (`excludeHeaders` in `createRecordedClient`) and undici's per-entry recording timestamp (stripped after recording); bodies stay verbatim but for email addresses, as text: the client asks Unleash for uncompressed answers and `src/unleash/testSnapshot.ts` rewrites them from base64 after recording and back for a replay, with the entries sorted by request rather than left in arrival order, and every email address in a body replaced by a stable pseudonym (`masked`); a recording masks what the test sees the same way, so `pnpm test:record` and `pnpm test` agree. Why: `docs/decisions.md` (Snapshots hold only what matters, Snapshots hold text, Snapshots hide email addresses).
- The sandbox holds no fixture: each recorded test file creates its own project with `createProjectNamed` in `before` and deletes it with `deleteProjectNamed` in `after`, flags included. What is global (segments, context fields, templates) a file creates in `before` and removes in `after`, coping with leftovers from a failed recording; flags need no cleanup before, the project is new.
- Setup goes through the tool functions (`createRelease`, `createSegment`, ...) and asserts their outcome with `applied` or `released` from `src/unleash/testSetup.ts`, which also has `createFlag` and `withoutChangeRequests`; raw admin calls, there and in tests, only where no tool does the job, and asserted too. Flag names start with `mcp-` and are unique across the instance, so each file uses its own.
- `pnpm test:record` records one file at a time, so one file's flags and settings changes never show up in another's snapshot.
- Tests must be subsecond. Avoid network I/O, timers and process spawning.
- Recorded tests assert the tool output only; don't read Unleash state back.
- Setup and teardown use the `admin` client from `createRecordedClient`; the code under test uses `unleash`. Change requests are cancelled by their author, `unleash`.

Why: `docs/decisions.md` (Testing against Unleash, Admin client for test setup and teardown, Test setup goes through the server's own tools).
