# `release` tool: flows

The agent calls `release` with a project, a flag, an environment and one or more targets.
The tool reads first, writes only when nothing is missing, and always answers with one of:
`released`, `pending_change_request`, `decisions`, or `failed`.

## Happy path

User: "Roll `checkout-v2` out to 50% of everyone and to all internal beta testers in production."

1. Agent calls `release` with
   `project: "shop"`, `flag: "checkout-v2"`, `environment: "production"`,
   `targets: [{ rollout: 50 }, { segments: ["internal-beta"] }]`.
2. Tool reads, in parallel once the project is known:
   the project's environments, the segments (only because a target names one),
   the context fields (skipped here, no constraints), then the flag in that environment.
3. All checks pass: the environment exists and is enabled, the flag exists with one strategy,
   the segment is visible to the project.
4. Tool reads the change request config: not required for production in this project.
5. Tool pairs targets with existing strategies by position and writes in order:
   update strategy 1 to `50%`, add strategy 2 `100% | segments internal-beta`.
   No deletes (nothing surplus), no enable call (already enabled).
6. Result `released`, rendered as:

   ```
   checkout-v2 in production: enabled
   - 50%
   - 100% | segments internal-beta
   ```

Strategy ids survive, so history shows "rollout changed", not "strategy deleted and created".
Each strategy carries a title equal to its summary line, so the UI shows the intent.

### Variant: change requests required

Same call, but the environment requires change requests.
Steps 1 to 4 are identical. Instead of writing, the tool posts one change request with
`updateStrategy`, `addStrategy` and, if the flag was disabled, `updateEnabled`.
Result `pending_change_request`:

```
checkout-v2 in production: not applied, in change request #1680 (Draft)
- 50%
- 100% | segments internal-beta
Submit the change request for review to get it applied.
```

Submitting, approving and applying belong to the change_requests tool.

## Unhappy paths

### Something is missing or invalid: `decisions`

Nothing is written. All independent problems come back together.

User: "Release `checkout-v2` to enterprise customers in prod."

1. Agent calls with `environment: "prod"`, `targets: [{ constraints: [{ field: "plan", operator: "IN", values: ["enterprise"] }] }]`.
2. Tool finds: no environment named `prod`; `enterprise` is not a legal value of `plan`.
3. Result `decisions`, rendered as:

   ```
   Environment "prod" not found in project shop. Which one?
   - development
   - production

   "enterprise" is not among the legal values of plan. Pick one, or add it with the context field tool first:
   - Enterprise
   - Pro
   ```

4. Agent fixes the input (or asks the user) and calls again with
   `environment: "production"` and `values: ["Enterprise"]`. Happy path from there.

Other `choose` decisions: missing project (lists projects, paged 20 at a time with
`search` and `page`), unknown context field (lists fields), unknown segment (lists segments
visible to the project).

### The flag does not exist: `confirm`

1. Tool reads the flag: 404.
2. Result `decisions` with one confirmation:

   ```
   Flag "checkout-v2" does not exist in project shop. Create it? (confirm: "createFlag")
   ```

3. Agent asks the user, then calls again with `confirm: ["createFlag"]`.
4. Tool creates the flag (type `release`), adds the strategies, enables the environment.

### Unleash rejects a request: `failed`

Marked `isError` so the agent sees a failure.

Mid-way, after one write succeeded:

```
Unleash request failed: add strategy "100% | segments internal-beta" (HTTP 400): <server message>
Already applied: updated strategy "50%". Nothing else was changed; call again with the same input to finish the release.
```

Because the input describes the end state, calling again converges: the first strategy is
updated to the same value, the second is added, and the result is `released`.

Before any write, for example a bad token:

```
Unleash request failed: read environments (HTTP 401): "Unauthorized"
Nothing was changed.
```

## Guarantees and gaps

- No write before every check has passed.
- Writes are ordered so every intermediate state is valid: update, add, delete surplus, enable.
  The environment never has zero strategies, so Unleash never auto-disables it.
- The input is an end state, so a retry after a partial failure finishes the job.
- Not atomic across several strategies: the API has no bulk strategy write.
- An open draft change request is not read when computing the current state, so repeated
  releases append to the same draft.
- No concurrency protection: a change made by someone else between the read and the writes is overwritten.
