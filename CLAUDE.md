# CLAUDE.md

Unleash MCP Server v2: an AI-agent-friendly interface to Unleash, built in small increments on the `v2` branch.

## Decisions

Decisions with long-term impact are recorded in `docs/decisions.md` (not short-lived microdecisions). Read it before starting work. When the driver makes a
new decision, add a dated entry in their own words (minor corrections only). Never guess: ask clarifying
questions and record the answer there.

## Commands

```bash
npm install   # Install dependencies
npm start     # Run the stdio server from source (Node runs TypeScript directly, no build step)
npm test      # Typecheck (tsc) then run tests with the Node test runner
npm run typecheck
```

Never write to stdout in stdio mode (it breaks the MCP handshake).
