# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Unleash MCP Server — a Model Context Protocol server for managing Unleash feature flags. It enables LLM-powered coding assistants to create, evaluate, detect, and wrap code changes with feature flags via the Unleash Admin API.

## Commands

```bash
yarn install          # Install dependencies (uses Yarn 1.x via Corepack)
yarn build            # Compile TypeScript (tsc) → dist/
yarn dev              # Run from source with tsx
yarn lint             # Lint with Biome
yarn lint:fix         # Lint and auto-fix with Biome
yarn test             # Run tests with Vitest (currently no test files)
```

Single test file: `npx vitest run src/path/to/file.test.ts`

## Architecture

This is an MCP server with a dual-mode architecture (stdio + remote HTTP). A transport-agnostic factory (`src/server.ts`) creates the `McpServer` with all tools and resources registered. Two entry points connect different transports:

- **Local (stdio) mode**: `src/index.ts` reads env vars/CLI flags, creates the server with PAT auth, and connects `StdioServerTransport`. This is the CLI entry point (`npx unleash-mcp`).
- **Embedded (remote) mode**: `src/remote.ts` exports `createMcpHandler()` for embedding inside an HTTP server (e.g. Express). Each request creates a fresh server + `StreamableHTTPServerTransport` pair with forwarded auth headers.

### Package Exports

- `@unleash/mcp` — Default entry (stdio CLI)
- `@unleash/mcp/server` — `createUnleashMcpServer(options)` factory function
- `@unleash/mcp/remote` — `createMcpHandler(defaults)` HTTP request handler

### Key Patterns

**Tool registration**: Each tool in `src/tools/` exports a `ToolDefinition` object (`src/tools/types.ts`) with `name`, `description`, `inputSchema` (Zod), and `implementation` function. Tools are registered in a loop in `src/server.ts`. To add a new tool: create a file in `src/tools/`, export a `ToolDefinition`, and add it to the `tools` array in `src/server.ts`.

**Shared context**: All tools receive a `ServerContext` (`src/context.ts`) containing `config`, `unleashClient`, `logger`, and `notifyProgress`. Use `ensureProjectId()` and `handleToolError()` from context for consistent behavior.

**API client**: `src/unleash/client.ts` (`UnleashClient`) wraps the Unleash Admin API using native `fetch`. Constructor takes `(baseUrl, authHeaders, dryRun)` where `authHeaders` is a `Record<string, string>` spread into every request. All methods support `--dry-run` mode by returning mock responses. Errors are thrown as `CustomError` (`src/utils/errors.ts`) with `{code, message, hint}` format.

**Input validation**: All tool inputs are validated with Zod schemas before any API calls.

**Logging**: Never write to stdout (breaks MCP stdio handshake). Use the `Logger` from context which writes to stderr or `APP_LOG_FILE`. The `MCP_STDIO_LOG_FILE` env var tees raw MCP protocol traffic for debugging.

### Module Layout

- `src/server.ts` — Transport-agnostic server factory (`createUnleashMcpServer`)
- `src/remote.ts` — HTTP request handler (`createMcpHandler`) for embedded mode
- `src/index.ts` — Stdio CLI entry point
- `src/tools/` — One file per MCP tool (createFlag, evaluateChange, detectFlag, wrapChange, cleanupFlag, setFlagRollout, getFlagState, toggleFlagEnvironment, removeFlagStrategy)
- `src/unleash/client.ts` — Unleash Admin API client
- `src/evaluation/` — Risk assessment and flag detection patterns (used by evaluateChange)
- `src/detection/` — Flag discovery strategies and scoring (used by detectFlag)
- `src/templates/` — Language detection, code wrapper templates, search guidance (used by wrapChange)
- `src/knowledge/` — Unleash best practices knowledge base
- `src/prompts/` — Markdown prompt formatting utilities
- `src/resources/` — MCP resource handlers for projects and feature flags
- `src/utils/` — Error normalization, streaming/progress notifications, stdio logging

## Code Style

Enforced by Biome (config in `biome.json`):
- 2-space indentation, 100-char line width
- Single quotes, trailing commas, semicolons
- Recommended lint rules enabled
- Import organization via Biome assist

TypeScript strict mode is on with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, and `noFallthroughCasesInSwitch`.

## Configuration

Required env vars: `UNLEASH_BASE_URL`, `UNLEASH_PAT`. Optional: `UNLEASH_DEFAULT_PROJECT`, `UNLEASH_DEFAULT_ENVIRONMENT`, `LOG_LEVEL`, `APP_LOG_FILE`, `MCP_STDIO_LOG_FILE`. CLI flags: `--dry-run`, `--log-level <level>`. See `.env.example` for reference.
