# Unleash MCP Server (feature flag scaffold)

Purpose-driven Model Context Protocol (MCP) server that helps LLM agents create Unleash feature flags safely. This first iteration focuses on the `feature_flag.create` tool while laying the groundwork for future evaluation and wrap capabilities.

## Prerequisites

- Node.js 18+
- npm

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Provide configuration. Either export environment variables or create a `.env` file with:

   ```dotenv
   UNLEASH_BASE_URL=https://app.unleash-hosted.com/hosted
   UNLEASH_PAT=your-admin-api-token
   # Optional defaults
   UNLEASH_DEFAULT_PROJECT=default
   UNLEASH_DEFAULT_ENVIRONMENT=development
   UNLEASH_DRY_RUN=false
   UNLEASH_LOG_LEVEL=info
   ```

3. Build and start the server:

   ```bash
   npm run build
   npm start
   ```

   The server listens on stdio for MCP transports. Use `--dry-run` to skip API calls or `--log-level=debug` for verbose output.

## Available tool: `feature_flag.create`

- **Inputs**
  - `projectId` (optional when `UNLEASH_DEFAULT_PROJECT` is set)
  - `name` (required)
  - `type` – one of `release`, `experiment`, `kill-switch`, `operational`, `permission`
  - `description` – capture rationale and cleanup plan
- **Behavior**
  - Validates inputs with Zod and enforces trimmed, non-empty strings.
  - Streams progress notifications when the client supplies a progress token.
  - Calls the Unleash Admin API `POST /api/admin/projects/{projectId}/features`.
  - Returns human-readable text plus:
    - `resource_link` to the feature’s Admin API endpoint.
    - `structuredContent` with UI/API URLs, feature metadata, and dry-run status.
- **Notes**
  - Dry-run mode simulates success without reaching Unleash, making it ideal for testing.
  - The tool description and instructions remind agents to reuse existing flags where possible and cite the official best practices guide: <https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale>.

## Configuration reference

- `UNLEASH_BASE_URL` – required; include the full base path if your instance is hosted (`https://app.unleash-hosted.com/hosted`).
- `UNLEASH_PAT` – required admin API token. The value is passed verbatim to the `Authorization` header.
- `UNLEASH_DEFAULT_PROJECT` – optional fallback when the tool input omits `projectId`.
- `UNLEASH_DEFAULT_ENVIRONMENT` – reserved for future tools; stored for completeness.
- `UNLEASH_DRY_RUN` (`true`/`false`) – default for dry run behavior.
- `UNLEASH_LOG_LEVEL` (`silent` | `error` | `info` | `debug`) – default logging verbosity.
- CLI flags override env defaults: `--dry-run`, `--log-level=<level>`.

## Project layout

- `src/index.ts` – bootstrap; creates the MCP server, loads config, registers tools.
- `src/config.ts` – environment & CLI parsing with validation.
- `src/context.ts` – shared context (config, logger, Unleash client, helpers).
- `src/client/unleashAdminClient.ts` – focused Admin API client for feature creation.
- `src/tools/featureFlagCreate.ts` – implementation of `feature_flag.create`.
- `src/utils/*` – logging, error normalization, and progress streaming helpers.
- `docs/architecture.md` – architectural guardrails and extension guidance.
- `docs/purpose-driven-design.md` – purpose → surface → implementation mapping.
- `docs/unleash-best-practices.md` – distilled notes from official Unleash guidance.

## Future work

- Add the `evaluate_change` prompt surface.
- Implement the `wrap_change` tool with language-aware snippets.
- Expand testing around dry-run and HTTP error handling.
