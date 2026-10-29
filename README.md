# Unleash MCP server

An MCP server that lets AI agents work with Unleash the way you'd work in the Unleash UI: find flags, roll them out, check who gets them, and see what changed. It's in alpha and isn't published to npm, so you run it from source.

## Install locally

You need Node 24 or later and pnpm.

1. Clone the repository and switch to the `v2` branch:

   ```bash
   git clone https://github.com/Unleash/unleash-mcp.git
   cd unleash-mcp
   git checkout v2
   ```

   This gets you the v2 source.

2. Install the dependencies:

   ```bash
   pnpm install
   ```

   Node runs the TypeScript source directly, so there's no build step.

3. In Unleash, create a personal access token under **Profile** > **Personal API tokens**. The server acts with that user's permissions.

4. Register the server with your MCP client. For Claude Code:

   ```bash
   claude mcp add unleash \
     -e UNLEASH_BASE_URL=https://your-instance.getunleash.io \
     -e UNLEASH_PAT=user:your-personal-access-token \
     -- node /absolute/path/to/unleash-mcp/src/index.ts
   ```

   This adds a stdio server named `unleash` to Claude Code. For clients configured with JSON, such as Claude Desktop, Cursor or VS Code, add this to their MCP servers:

   ```json
   {
     "mcpServers": {
       "unleash": {
         "command": "node",
         "args": ["/absolute/path/to/unleash-mcp/src/index.ts"],
         "env": {
           "UNLEASH_BASE_URL": "https://your-instance.getunleash.io",
           "UNLEASH_PAT": "user:your-personal-access-token"
         }
       }
     }
   }
   ```

5. Ask your agent "List my Unleash projects". If it answers with your projects, the server is running.

## Configure the local server

| Variable                    | Required | Description                                                                                                        |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `UNLEASH_BASE_URL`          | Yes      | URL of your Unleash instance, such as `https://sandbox.getunleash.io/enterprise`.                                  |
| `UNLEASH_PAT`               | Yes      | Personal access token the server calls Unleash with.                                                               |
| `UNLEASH_MCP_SEND_FEEDBACK` | No       | `true` sends reports without asking, `false` leaves `send_feedback` out. Unset, you are asked on the first report. |
| `UNLEASH_FEEDBACK_URL`      | No       | Unleash instance that receives `send_feedback` reports. Unset, reports fail.                                       |
| `UNLEASH_MCP_CONFIG_DIR`    | No       | Directory that keeps your answer, `feedback_consent.json`. Defaults to your platform config directory.             |

`send_feedback` sends anonymous reports to Unleash when the server fell short: a tool error, a request no tool supports, or a wrong result. A report names the tool, the error and the MCP client the agent runs in. Say yes to help us fix what doesn't work for you.

Nothing is sent until you agree. The first report asks you through your MCP client, and your answer is kept in `feedback_consent.json`, so you're asked once. The file sits in an `unleash-mcp` directory under `$XDG_CONFIG_HOME` when it's set, otherwise under `~/Library/Application Support` on macOS, `%APPDATA%` on Windows and `~/.config` on Linux. Delete it to be asked again.

If you dismiss the question, or your client can't show it, feedback stays off until the next session. OpenCode, Gemini and Antigravity never show it, so there feedback stays off unless `UNLEASH_MCP_SEND_FEEDBACK` is `true`.

To keep secrets out of your client config, copy `.env.example` to `.env`, fill it in, and start the server with `node --env-file=.env /absolute/path/to/unleash-mcp/src/index.ts`.

## Connect to the remote server

Unleash Enterprise can serve this MCP server itself, over [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http), so nothing runs on your machine. An admin turns it on under **Admin** > **Remote MCP Server**; the same page decides whether `send_feedback` reports are sent.

Register the server with your MCP client. For Claude Code:

```bash
claude mcp add unleash https://your-instance.getunleash.io/api/admin/mcp --transport http
```

For Codex:

```bash
codex mcp add unleash https://your-instance.getunleash.io/api/admin/mcp --transport http
```

On first use, the client opens your browser to log in to Unleash. Unleash then creates a personal access token for the client, valid for 24 hours by default, and the server acts with your permissions.

Where a browser login isn't possible, such as in CI, send a personal access token of your own instead and no login happens:

```bash
claude mcp add unleash https://your-instance.getunleash.io/api/admin/mcp \
  --transport http \
  --header "Authorization: Bearer user:your-personal-access-token"
```

## Tools

| Tool            | Description                                                                                                                                                                                  | Example prompt                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `search`        | Find projects, flags, segments, context fields, tags, tag types, flag creators, release templates, event types and environments by name.                                                     | "Which flags in the checkout project are tagged team:payments?" |
| `inspect`       | Read a project, flag, context field or segment in full.                                                                                                                                      | "Show me everything about the new-checkout flag."               |
| `evaluate`      | Tell whether a flag is on, off or unknown for a context in an environment.                                                                                                                   | "Does user 42 get new-checkout in production?"                  |
| `release`       | Turn a flag on for audiences, split by value or through a release template, or turn it off. Creates the flag if it doesn't exist. Opens a change request where the environment requires one. | "Roll out new-checkout to 10% of users in production."          |
| `kill_switch`   | Turn a permanent kill switch on or off, for everyone or chosen audiences. Creates the switch if it doesn't exist. Opens a change request where the environment requires one.                 | "Turn off payments in production."                              |
| `experiment`    | Run an A/B test: give audiences values such as control and treatment, by share or one each, or stop it. Creates a missing flag. Opens a change request where the environment requires one.   | "Split checkout 50/50 between control and the new flow."        |
| `manage_flag`   | Define flags, set a parent dependency, mark flags completed, archive and revive them. Doesn't delete flags.                                                                                  | "Archive the old-banner flag."                                  |
| `configure`     | Change context fields and their legal values, segments, tag types and tags, release templates and projects.                                                                                  | "Create a beta-testers segment for userId 1, 2 and 3."          |
| `audit`         | Read what changed, who changed it and when, over at most 31 days.                                                                                                                            | "What changed in production yesterday?"                         |
| `send_feedback` | Report to Unleash where the server fell short. Asks you first, unless `UNLEASH_MCP_SEND_FEEDBACK` decides.                                                                                   | None: the agent calls it on its own.                            |

## Development

- [Development setup](docs/development.md): running tests and the dev server in Claude Code.
- [Decisions](docs/decisions.md): why the server works the way it does.
