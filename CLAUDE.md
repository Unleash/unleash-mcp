# CLAUDE.md

Unleash MCP Server v2: an interface to Unleash that can replace the UI, built for AI agents. Developed on the `v2` branch.

## Working agreements

- Work in small increments (1–200 LOC).
- Self-check each increment with the `unleash-internal:code-review` skill.
- Leave increments uncommitted; the driver reviews and commits. You may suggest a commit message.
- When a task is done, run the `record-decision` skill.

## Commands

```bash
npm install
npm start               # stdio server from source
npm test                # typecheck + tests, replaying recorded snapshots
npm run typecheck
npm run test:record     # see the record-snapshots skill
npm run spec:update     # see the update-openapi-spec skill
npm run spec:generate
```

## Where things live

- `docs/decisions.md`: why things are the way they are. Read it before starting a task.
- `docs/development.md`: local setup and running the dev server in Claude Code.
- `.claude/rules/`: path-scoped coding rules, loaded automatically.
- `.claude/skills/`: `record-decision`, `record-snapshots`, `update-openapi-spec`.
