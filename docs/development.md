# Development

## Setup

- `nvm use` for Node 26: the snapshots were recorded on it, and `pnpm test` replays them only on the same major. The server supports Node 24+.
- `pnpm install`
- Copy `.env.example` to `.env` (gitignored) and fill in a PAT for the Unleash sandbox.

## Dev server in Claude Code

The checked-in `.mcp.json` registers the server as `unleash-dev`. It runs `src/index.ts` directly and loads secrets from `.env`.

- Plain `claude` asks once to approve the project server.
- `claude --mcp-config .mcp.json --strict-mcp-config` skips that prompt.
