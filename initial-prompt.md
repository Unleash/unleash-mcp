# Initial Prompt — Unleash MCP

You are an expert Node.js/TypeScript developer building a **Model Context Protocol (MCP)** server from scratch. Channel the mindset of an experienced Unleash engineer: apply the platform’s best practices, reference official guidance, and be ready to surface relevant excerpts from `https://docs.getunleash.io/` whenever the situation calls for it. The goal is to help an LLM act as a purpose-driven coding buddy that keeps risky changes safely gated behind Unleash feature flags while staying ready to grow into richer rollout workflows.

## Project Objectives
- **Create** — Provide a tool that talks to the **Unleash Admin API** to create feature flags with minimal ceremony.
- **Evaluate** — Offer a prompt that evaluates a change and guides the agent on whether a flag is warranted and which rollout strategy makes sense.
- **Wrap** — Deliver a tool that returns language-specific code snippets showing how to guard the change behind the flag.

Keep the codebase intentionally thin: one file per capability, shared helpers only where they remove duplication, and no extra abstractions beyond what these three surfaces need.

For API reference, rely on the Unleash Admin API OpenAPI document (`https://app.unleash-hosted.com/hosted/docs/openapi.json`). Only invoke the endpoints required to fulfil the three tasks; avoid generic “API explorer” calls or non-purposeful requests.

## Required Surfaces
1. `feature_flag.create` (tool)  
   - Inputs: project id (optional if default set), flag name, type, description.  
   - Behavior: validate inputs with zod, call the Unleash **Admin API** to create the flag, stream progress, return the flag URL and an MCP `resource_link`.  
   - Helper: implement a small Unleash client focused solely on the endpoints you actually use.

2. `evaluate_change` (prompt)  
   - Inputs: optional JSON blob describing repo, branch, files, risk notes.  
   - Output: guidance for the LLM — when to create a flag, suggested rollout steps (dev enablement, staged percentage rollout), and the next tool to call.  
   - Tone: proactive, authoritative, and aligned with Unleash best practices. Explicitly cite relevant advice from `https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale` (e.g., flag lifecycle ownership, limiting flag lifetime, rollout sequencing) and point to the Admin API surfaces that the accompanying tools expose.

3. `wrap_change` (tool)  
   - Inputs: flag key, primary language, optional code context.  
   - Behavior: return a small library of guard-snippet templates (e.g., Node/TypeScript, Python, Java). When code context includes existing feature-flag usage, detect and mirror prevailing conventions—import forms, helper names, wrapping style (if blocks, early returns, hooks), naming of clients—before falling back to sensible defaults. Make the detection transparent in the response so the LLM understands why a pattern was chosen.  
   - No network calls—just structured snippets plus textual explanation and optional pattern-detection notes.

## Architecture Guardrails
- **Bootstrapping:** minimal `index.ts` that loads config, creates the Unleash Admin API client, builds a shared context, registers the three surfaces, and starts the stdio transport.  
- **Config:** support `.env` variables for `UNLEASH_BASE_URL`, `UNLEASH_PAT`, optional default project/environment, plus `--dry-run` and `--log-level` flags.  
- **Shared context:** include the MCP server, logger, config, and Unleash admin client; expose helper functions like `ensureProjectId` and `handleToolError`.  
- **Streaming:** use a thin wrapper to emit progress and link notifications from tools.  
- **Error normalization:** collapse Zod, fetch/HTTP, and custom errors into `{code,message,hint}` so the LLM can recover gracefully.
- **Purpose discipline:** document these guardrails inside the repository (e.g., `docs/architecture.md`, inline comments where helpful) so future contributors keep the codebase thin and purpose-led.
- **Guard against flag sprawl:** even with a small tool surface, encourage surfaces (especially the evaluation prompt) to remind the LLM to reuse or extend existing flags before creating new ones, and to record rationale so future workflows can build on it.
- **Docs-aware behavior:** include a lightweight helper or doc-notes module that captures distilled guidance from Unleash documentation so prompts and tools can cite official recommendations without re-scraping the source each time.

## Development Steps
1. Scaffold the project (`npm init`, TypeScript config, MCP SDK dependency).  
2. Implement config loading + validation.  
3. Build the Unleash Admin API client with only the endpoints required for flag creation.  
4. Add the shared runtime context and streaming helper.  
5. Implement each capability module (`tools/featureFlagCreate.ts`, `prompts/evaluateChange.ts`, `tools/wrapChange.ts`).  
6. Wire them up in `index.ts`, register logging capability, and ensure dry-run mode short-circuits HTTP calls.  
7. Write a concise `README.md` describing setup, env vars, usage of each surface, explicitly noting that the server follows Unleash best practices and links out to the official guidance page.  
8. Provide a `docs/purpose-driven-design.md` (or similar) explaining how the purpose → surface → implementation mapping works for this project, and capture architectural/coding guidelines within source-controlled docs. Add a condensed best-practices cheat sheet (derived from the docs site) that tools/prompts can reference.

## Quality Checklist
- Type-check with `npm run lint` (use `tsc --noEmit` or equivalent).  
- Test dry-run behavior manually or via small unit stubs.  
- Ensure all tool responses include both human-readable text and structured content the LLM can follow up on.  
- Document the Unleash Admin API endpoints invoked so future contributors know exactly which surfaces are supported and keep interactions scoped to the tasks at hand.
- Capture rationale for any detected code patterns and default fallbacks so wrapping behavior stays predictable across sessions.
- Verify that the evaluation prompt and other guidance surfaces cite or summarize Unleash best practices (flag lifecycle, cleanup, rollout sequencing) when recommending actions.

Deliver a repo that embodies purpose-driven MCP design: a focused surface area, proactive guidance, and tight integration with the Unleash Admin API to keep risky changes safely wrapped while leaving room to evolve into broader rollout tooling.
