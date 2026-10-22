---
paths:
  - "src/tools/**"
---

# MCP tools

- Split each tool into input schema, logic and output schema. Files and exports carry the tool name (`releaseInput.ts`, not `input.ts`).
- A success returns `structuredContent` only; a failure returns a text block only.
- Keep output token efficient by returning minimal fields, shaped by hand on top of the generated Unleash types.
- Every union tags its success case with a `kind`; never a bare string next to result objects.
- A step (e.g. `flag.ts`) lives in its own file with its tests, owns the agent-facing results it can produce, and reuses the shared ones (`failed.ts`, `target.ts`: the audience shape release takes and inspect returns). The tool function only composes steps.
- Take a list of operations when the agent can name each part and each change is one Unleash call. Take an end state and diff it when parts have no agent-facing identity or rules span them.

Why: `docs/decisions.md` (Tool structure, Unleash HTTP client, Tool layering, End state or operations).
