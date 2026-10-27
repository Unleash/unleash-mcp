---
paths:
  - "src/**/*.ts"
---

# Source code

- Node 24+ runs the TypeScript directly (type stripping) in development and tests. Only use syntax `erasableSyntaxOnly` allows; `tsc` only checks. `pnpm build` emits `dist/` for the published package only.
- Never write to stdout: in stdio mode it breaks the MCP handshake.
- Keep dependencies minimal. Ask before adding one.
- Be light on the Unleash backend: agents call more than humans, so use the fewest requests possible. Pass `view=core` wherever the endpoint offers it.
- Be token efficient in anything the agent reads.

Why: `docs/decisions.md` (v2 constraints, Toolchain, Type checking, Core views, Published package is built).
