---
name: record-snapshots
description: Re-record the Unleash HTTP snapshots that tests replay. Use after adding or changing a test that calls Unleash, or when a replayed snapshot no longer matches the request.
---

# Record snapshots

1. Make sure `.env` exists (copy `.env.example`) with a PAT for the Unleash sandbox (`UNLEASH_PAT`) and an admin PAT for setup and teardown (`UNLEASH_ADMIN_PAT`). Ask the driver if either is missing; never invent credentials.
2. The sandbox needs nothing set up: each test file creates its own project, starting over from what the last recording left (see `.claude/rules/testing.md`). It must be Enterprise with the environments `development` and `production`, Unleash's built-in context fields and tag type `simple`, and the user PAT's account must hold the Editor root role, which creates projects.
3. Run `pnpm test:record`. It runs the test files one at a time against the real Unleash, so no file sees another's flags, and rewrites the `*.snapshot.json` files next to them.
4. Review the snapshot diff: no tokens or secrets, no unrelated churn.
5. Run `pnpm test` to confirm the replay passes and stays subsecond.

## When a recording goes wrong

- The sandbox can answer `502 Bad Gateway`. A snapshot holding a 5xx response is wrong even if the test passed; re-record that file on its own: `UNLEASH_SNAPSHOT_MODE=record node --env-file=.env --test <file>`.
