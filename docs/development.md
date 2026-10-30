# Development

## Setup

- `nvm use` for Node 26, the development version. The server supports Node 24+.
- `pnpm install`
- Copy `.env.example` to `.env` (gitignored) and fill in a PAT for the Unleash sandbox.
- `pnpm install` points git at `.githooks`, whose pre-commit hook runs `pnpm check`. `git commit --no-verify` skips it.

## Dev server in Claude Code

The checked-in `.mcp.json` registers the server as `unleash-dev`. It runs `src/index.ts` directly and loads secrets from `.env`.

- Plain `claude` asks once to approve the project server.
- `claude --mcp-config .mcp.json --strict-mcp-config` skips that prompt.
