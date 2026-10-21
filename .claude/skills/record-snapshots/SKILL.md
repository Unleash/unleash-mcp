---
name: record-snapshots
description: Re-record the Unleash HTTP snapshots that tests replay. Use after adding or changing a test that calls Unleash, or when a replayed snapshot no longer matches the request.
---

# Record snapshots

1. Make sure `.env` exists (copy `.env.example`) with a PAT for the Unleash sandbox (`UNLEASH_PAT`) and an admin PAT for setup and teardown (`UNLEASH_ADMIN_PAT`). Ask the driver if either is missing; never invent credentials.
2. The sandbox needs project `mcp-server` with flag `mcp-flag`.
3. Run `npm run test:record`. It runs the tests against the real Unleash and rewrites the `*.snapshot.json` files next to them.
4. Review the snapshot diff: no tokens or secrets, no unrelated churn.
5. Run `npm test` to confirm the replay passes and stays subsecond.
