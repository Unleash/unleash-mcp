# CLAUDE.md

Unleash MCP Server v2: an AI-agent-friendly interface to Unleash, built in small increments on the `v2` branch.

## When writing to decisions.md

- Be VERY succinct.
- Only register decisions that affect the future of the project, don't register specific implementation details. Good: "we are going to implement three layered architecture". Bad: "A "no" to a confirm ends the workflow with a `declined` outcome instead of asking again."

## When working on a task

- Read `docs/decisions.md`.
- When your task is done, register all decisions made by the driver in their own words. Never guess: ask clarifying questions and record the answer there.

## Commands

```bash
npm install   # Install dependencies
npm start     # Run the stdio server from source (Node runs TypeScript directly, no build step)
npm test      # Typecheck (tsc) then run tests with the Node test runner, replaying recorded snapshots (no network)
npm run test:record     # Run tests against the real Unleash (.env) and re-record the snapshots
npm run typecheck
npm run spec:update     # Download the OpenAPI spec (gitignored) and regenerate src/unleash/api.d.ts (generated, don't edit)
npm run spec:generate   # Regenerate from an already downloaded spec
```

Never write to stdout in stdio mode (it breaks the MCP handshake).
