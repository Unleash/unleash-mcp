---
paths:
  - "src/**/*.ts"
---

# Source code

- Node 24+ runs the TypeScript directly (type stripping): no build step. Only use syntax `erasableSyntaxOnly` allows; `tsc` only checks.
- Never write to stdout: in stdio mode it breaks the MCP handshake.
- Keep dependencies minimal. Ask before adding one.
- Be light on the Unleash backend: agents call more than humans, so use the fewest requests possible. Pass `view=core` wherever the endpoint offers it.
- Be token efficient in anything the agent reads.

Why: `docs/decisions.md` (v2 constraints, Toolchain, Type checking, Core views).
