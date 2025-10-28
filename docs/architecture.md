# Architecture Guardrails

This MCP server is intentionally lightweight. Each capability lives in its own module and shares only the minimal plumbing needed for safe feature flag interactions.

## Core pieces

- `src/index.ts` – bootstraps the MCP server, wires transport, and registers tools.
- `src/context.ts` – constructs the shared runtime (config, logger, Unleash client) and exposes helpers such as `ensureProjectId` and `handleToolError`.
- `src/client/unleashAdminClient.ts` – narrow Admin API client that only exposes functionality the tools actually use. Add endpoints here sparingly.
- `src/tools/*` – one file per MCP surface. The current iteration only includes `feature_flag.create`.
- `src/utils/*` – focused helpers for logging, progress streaming, and error normalization. Avoid a generic utility grab bag.

## Design principles

- **Purpose-driven modules** – implement only what the surface needs. When adding new capabilities, create a new file and reuse helpers instead of extending existing tools with unused options.
- **Explicit configuration** – all runtime options come from environment variables or explicit CLI flags. New settings must be validated in `src/config.ts` using Zod so that misconfiguration fails fast.
- **Streaming-first tools** – use `createProgressReporter` to surface progress updates whenever the caller supplies a progress token. New tools should adopt the same pattern to keep the LLM informed during long-running operations.
- **Error normalization** – always return `CallToolResult` objects with `isError: true` when something goes wrong. Converting exceptions through `normalizeError` keeps the agent in recovery mode without crashing the transport.
- **Dry-run safety** – the Unleash client short-circuits HTTP calls when dry-run mode is active. Future endpoints should respect the same flag to make validation safe in CI or smoke tests.

## Extending the server

1. Add the new capability under `src/tools` or `src/prompts`.
2. Extend the shared context only if multiple surfaces require the new data; otherwise keep the logic local to the new module.
3. Update `docs/purpose-driven-design.md` with the new purpose/surface mapping and capture any additional best practices that the agent should cite.
4. Document the exact Admin API endpoints used in the README to make auditing easy.

Staying disciplined about these guardrails keeps the codebase approachable and the agent behavior predictable as we grow beyond feature creation.
