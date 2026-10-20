---
paths:
  - "src/tools/**"
---

# MCP tools

- Split each tool into input schema, logic and output schema. Files and exports carry the tool name (`releaseInput.ts`, not `input.ts`).
- Return `structuredContent` only, no text block.
- Keep output token efficient by returning minimal fields, shaped by hand on top of the generated Unleash types.

Why: `docs/decisions.md` (Tool structure, Unleash HTTP client).
