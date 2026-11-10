---
paths:
  - "**/*.test.ts"
  - "**/*.snapshot.json"
---

# Tests

- No hand-written fetch mocks. Tests run against Unleash through undici's `SnapshotAgent`: `pnpm test` replays checked-in snapshots, the `record-snapshots` skill re-records them.
- Snapshots leave out churning response headers (`excludeHeaders` in `createRecordedClient`) and undici's per-entry recording timestamp (stripped after recording); bodies stay verbatim but for email addresses and the projects listing, as text: the client asks Unleash for uncompressed answers and `src/unleash/testSnapshot.ts` rewrites them from base64 after recording and back for a replay, with the entries sorted by request rather than left in arrival order, every email address in a body replaced by a stable pseudonym, every IP address by a reserved one, and a projects listing cut down to the `mcp-` test projects (`masked`); a recording masks what the test sees the same way, so `pnpm test:record` and `pnpm test` agree. Why: `docs/decisions.md` (Snapshots hold only what matters, Snapshots hold text, Snapshots hide email addresses, Recording sees the pseudonyms too, Snapshots keep only the test projects of a listing).
- The sandbox holds no fixture: each recorded test file creates its own project with `createProjectNamed` in `before`, after removing what an earlier recording left of it, flags and pending change requests included; what is global (segments, context fields, templates) a file deletes by name and creates in `before` too. A test cleans up before, not after: what it made stays in the sandbox for a look when something went wrong. Only release templates go in `after`, with what keeps them in use, since the instance caps them at ten.
- Setup goes through the tool functions (`createRelease`, `createSegment`, ...) and asserts their outcome with `applied` or `released` from `src/unleash/testSetup.ts`, which also has `createFlag` and `withoutChangeRequests`; raw admin calls, there and in tests, only where no tool does the job, and asserted too. Flag names start with `mcp-` and are unique across the instance, so each file uses its own.
- `pnpm test:record` records one file at a time, so one file's flags and settings changes never show up in another's snapshot.
- Tests must be subsecond. Avoid network I/O, timers and process spawning.
- Recorded tests assert the tool output only; don't read Unleash state back.
- Setup and teardown use the `admin` client from `createRecordedClient`; the code under test uses `unleash`. Exceptions, both for lack of rights: the file's project is created by `unleash`, which owns it, and change requests are cancelled by their author, `unleash`.

Why: `docs/decisions.md` (Testing against Unleash, Admin client for test setup and teardown, Test setup goes through the server's own tools, Each test file creates its own project, Recording sees the pseudonyms too).
