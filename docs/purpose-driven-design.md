# Purpose → Surface → Implementation

| Purpose | Surface | Implementation notes |
| --- | --- | --- |
| Create feature flags with minimal ceremony | `feature_flag.create` tool | Validates input via Zod, streams progress, and calls `POST /api/admin/projects/{projectId}/features`. Returns UI/API links plus structured metadata so downstream prompts can reference the flag. |
| Evaluate whether a change needs a flag | _Planned_: `evaluate_change` prompt | Will summarize repo context, cite Unleash best practices, and instruct the agent on rollout strategy. Not yet implemented in this iteration. |
| Provide language-specific guard snippets | _Planned_: `wrap_change` tool | Will surface code templates tailored to the detected language or existing flag usage. Not part of the current scaffold. |

## How to extend

1. Add a new surface under `src/tools` or `src/prompts`, keeping a one-file-per-capability structure.
2. Reuse shared helpers (`ensureProjectId`, `handleToolError`, `createProgressReporter`) instead of duplicating boilerplate.
3. Document new Admin API endpoints in the README and capture any doc-derived guidance in `docs/unleash-best-practices.md`.
4. Update this table when adding surfaces so contributors understand why each module exists.
