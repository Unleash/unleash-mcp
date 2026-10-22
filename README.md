# Unleash MCP Server

A purpose-driven [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for managing [Unleash](https://www.getunleash.io/) feature flags. This server enables LLM-powered coding assistants to create and manage feature flags following Unleash best practices.

To share feedback, join our [community Slack](https://www.getunleash.io/unleash-community) or open an [issue on GitHub](https://github.com/Unleash/unleash-mcp/issues).

## Overview

This MCP server provides tools that integrate with the [Unleash Admin API](https://docs.getunleash.io/understanding-unleash/unleash-overview#admin-api), allowing AI coding assistants to:

- **Create feature flags** with proper validation and typing.
- **Detect existing flags** to prevent duplicates or encourage reuse.
- **Evaluate changes** to decide when a feature flag is needed.
- **Stream progress** for visibility during operations.
- **Handle errors** gracefully with helpful hints.
- **Report problems** with the MCP to Unleash through `send_feedback`, only after the user opts in.
- **Follow best practices** from the [Unleash documentation](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale).

### Available tools

The MCP server exposes the following tools:

- `create_flag`: Creates a feature flag in Unleash.
- `evaluate_change`: Scores risk and recommends feature flag usage.
- `detect_flag`: Discovers existing feature flags to avoid duplicates.
- `wrap_change`: Provides guidance on how to wrap a change in a feature flag.
- `set_flag_rollout`: Sets who gets a feature flag in each environment: rollout percentage, segments, constraints, and whether the environment is on.
- `create_targeting`: Creates the context fields and segments that `set_flag_rollout` targets, in a project or for every project.
- `get_flag_state`: Surfaces a feature flag's metadata and its activation strategies.
- `get_flag_history`: Returns a feature flag's recent changes from the event log, each as a diff of what changed, who changed it, when, and in which environment.
- `evaluate_flag`: Evaluates a single feature flag against an Unleash context (for example a user ID and custom properties) in an environment, and explains which strategies matched.
- `list_flags`: Lists all feature flags in a project, with optional pagination and sort order.
- `search_flags`: Searches active feature flags in all projects by part of their name or description, or finds one flag and its project by its full name.
- `list_projects`: Lists Unleash projects available to the configured token, with optional pagination.
- `toggle_flag_environment`: Enables or disables a feature flag in an environment.
- `remove_flag_strategy`: Deletes a feature flag's strategy from an environment.
- `update_flag_lifecycle`: Completes, uncompletes, archives, or revives a feature flag, or marks it as stale.
- `cleanup_flag`: Generates instructions for safely removing flagged code paths.
- `send_feedback`: Reports a failed tool call, an unsupported request, or an unexpected result to Unleash so the MCP can be improved. Requires the user's consent. Not listed when consent is denied up front through `UNLEASH_MCP_SEND_FEEDBACK=false` or the `feedbackConsent` server option.

### Core workflow

The core workflow for an AI assistant is designed to be:
1. `evaluate_change`: First, assess a code change to see if a flag is needed.
2. `detect_flag`: This is often called automatically by `evaluate_change` to prevent creating duplicate flags.
3. `create_flag`: If a new flag is required, this tool creates it in Unleash.
4. `wrap_change`: Finally, this tool provides the language-specific code to implement the new flag.

See more information on the core workflow tools in the [Tool reference](#tool-reference) section.

## Prerequisites

Before you can run the server, you need the following:
- Node.js 22 or higher
- pnpm package manager or npm
- An Unleash instance (hosted or self-hosted)
- A [personal access token](https://docs.getunleash.io/reference/api-tokens-and-client-keys#personal-access-tokens) with permissions to create feature flags

## Get started

This section covers the different ways to install and run the Unleash MCP server. You can either follow a setup for [agents](#agent-setup) (such as Claude Code and Codex), run the MCP as a [standalone process](#quickstart-with-npx) using npx, or use a [local development](#local-development-setup) setup.

### Agent setup

You can add the MCP server directly to Claude Code or Codex. Agent configurations are path-specific. You must run the following command from the root directory of the project where you want to use the MCP.

For Claude Code:

```
claude mcp add unleash \
    --env UNLEASH_BASE_URL={{your-instance-url}} \
    --env UNLEASH_PAT={{your-personal-access-token}} \
    -- npx -y @unleash/mcp@latest --log-level error
```

For Codex:
```
codex mcp add unleash \
    --env UNLEASH_BASE_URL={{your-instance-url}} \
    --env UNLEASH_PAT={{your-personal-access-token}} \
    -- npx -y @unleash/mcp@latest --log-level error
```

### Remote agent setup (experimental)

Instead of running the MCP server locally, you can connect directly to your Unleash instance's built-in remote MCP server over HTTP. This uses the [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) — no local process needed.

> **Note:** Remote MCP is an experimental feature that must be enabled on your Unleash instance. Contact the Unleash team to get it enabled.

#### OAuth

The OAuth flow opens your browser, lets you log in to Unleash, and automatically provisions a short-lived PAT. No manual token management required.

For Claude Code:

```bash
claude mcp add unleash https://{{your-instance-url}}/api/admin/mcp --transport http
```

For Codex:

```bash
codex mcp add unleash https://{{your-instance-url}}/api/admin/mcp --transport http
```

On first use, the client will automatically open your browser for login. After authenticating with Unleash, a PAT is created and used for all subsequent requests.

The PAT expires after 24 hours by default.

#### Personal Access Token (PAT)

Use this method when you already have a PAT or need headless/non-interactive access (CI pipelines, shared developer environments, clients that don't support OAuth).

To create a PAT: log in to your Unleash instance, go to **Profile** > **Personal Access Tokens**, and create a new token.

For Claude Code:

```bash
claude mcp add unleash https://{{your-instance-url}}/api/admin/mcp \
  --transport http \
  --header "Authorization: Bearer {{your-personal-access-token}}"
```

For Codex:

```bash
codex mcp add unleash https://{{your-instance-url}}/api/admin/mcp \
  --transport http \
  --header "Authorization: Bearer {{your-personal-access-token}}"
```

The `--header` flag sends the PAT directly, bypassing the OAuth flow entirely.

### Quickstart with npx

You can run the MCP server as a standalone process without cloning the repository using `npx`. Provide configuration through environment variables or a local `.env` file in the directory where you run the command:

```bash
UNLEASH_BASE_URL={{your-instance-url}} \
UNLEASH_PAT={{your-personal-access-token}} \
UNLEASH_DEFAULT_PROJECT={{default_project_id}} \
npx @unleash/mcp@latest --log-level debug
```

The CLI supports the same flags as the local build (for example, `--dry-run`, `--log-level`).

### Local development setup

Follow these steps to set up the project for local development.

1. **Install dependencies**

Clone the repository and install dependencies using pnpm. Corepack keeps everyone on the same pnpm version:

```bash
git clone https://github.com/Unleash/unleash-mcp.git
cd unleash-mcp

# Enable Corepack once per machine, then prepare the pnpm this repo expects
corepack enable
corepack prepare pnpm@11.0.8 --activate

pnpm install
```

2) **Run in dev mode directly from Claude or Codex**

Avoid `npm run` output and `tsx watch` banners because any extra stdout breaks the MCP handshake. Two quiet options:

**A) Use compiled JS (most reliable)**
```
npm run build
# or keep it hot in another terminal: npm run build:watch

claude mcp add unleash-dev \
  --env UNLEASH_BASE_URL={{your-instance-url}} \
  --env UNLEASH_PAT={{your-personal-access-token}} \
  --env LOG_LEVEL=debug \
  --env APP_LOG_FILE="$(pwd)/app.log" \
  --env MCP_STDIO_LOG_FILE="$(pwd)/mcp-stdio.log" \
  -- node "$(pwd)/dist/index.js"

codex mcp add unleash-dev \
  --env UNLEASH_BASE_URL={{your-instance-url}} \
  --env UNLEASH_PAT={{your-personal-access-token}} \
  --env LOG_LEVEL=debug \
  --env APP_LOG_FILE="$(pwd)/app.log" \
  --env MCP_STDIO_LOG_FILE="$(pwd)/mcp-stdio.log" \
  -- node "$(pwd)/dist/index.js"
```

**B) Use TypeScript directly (no build)**
```
claude mcp add unleash-dev \
  --env UNLEASH_BASE_URL={{your-instance-url}} \
  --env UNLEASH_PAT={{your-personal-access-token}} \
  --env LOG_LEVEL=debug \
  --env APP_LOG_FILE="$(pwd)/app.log" \
  --env MCP_STDIO_LOG_FILE="$(pwd)/mcp-stdio.log" \
  -- node --no-warnings --import tsx "$(pwd)/src/index.ts"

codex mcp add unleash-dev \
  --env UNLEASH_BASE_URL={{your-instance-url}} \
  --env UNLEASH_PAT={{your-personal-access-token}} \
  --env LOG_LEVEL=debug \
  --env APP_LOG_FILE="$(pwd)/app.log" \
  --env MCP_STDIO_LOG_FILE="$(pwd)/mcp-stdio.log" \
  -- node --no-warnings --import tsx "$(pwd)/src/index.ts"
```

Notes:
- `node --import tsx` is quiet (no npm lifecycle output) and runs TS directly; use this when you want to avoid building.
- `node dist/index.js` is the safest choice; pair it with `npm run build:watch` to rebuild on changes while the agent command stays stable.
- Logs stay in the repo root (`app.log`, `mcp-stdio.log`), both gitignored.

### Logging control

- `LOG_LEVEL` (preferred): controls application logging verbosity (`debug`, `info`, `warn`, `error`). Defaults to `error` when unset.
- `--log-level` CLI flag: optional override for `LOG_LEVEL` when you want a one-off change.
- `APP_LOG_FILE` (optional): if set, application logs are written to this file (not stdout). If unset, logs go to stderr.
- `MCP_STDIO_LOG_FILE` (optional): if set, MCP stdin/stdout/stderr are tee’d into this single file with channel prefixes. Protocol messages still flow over stdout normally.

### Client attribution

When an MCP client sends `clientInfo` during initialization (Claude Code, Cursor, Copilot, Windsurf, Codex, Kiro, and other conforming clients), the server enriches the `User-Agent` header on outbound Unleash Admin API calls:

```
User-Agent: unleash-mcp/<version> (MCP Server; client=claude-code/1.2.3)
```

This makes Unleash event logs answer "which AI tool created or toggled this flag" without any server-side changes. Attribution values are sanitized so they cannot break the User-Agent header.

Set `UNLEASH_MCP_CLIENT_ATTRIBUTION=off` to disable enrichment and revert to `unleash-mcp/<version> (MCP Server)`. Default: enabled.

## Tool reference

This section describes each of the core tools in detail, including its purpose, parameters, and output.

Before writing, these tools read the project's change request settings and your permissions. As in the Unleash UI, where your changes need approval, `set_flag_rollout`, `toggle_flag_environment` and `remove_flag_strategy` put the change into a [change request](https://docs.getunleash.io/concepts/change-requests); with `ADMIN` or `SKIP_CHANGE_REQUEST` there they write directly. Archiving with `update_flag_lifecycle` goes into a change request for everyone while any environment has change requests on, in a production environment first. The result has `outcome: "pendingApproval"` with `requested` and the change request's `id`, `url` and `state`; elsewhere it is `outcome: "saved"`.

The change goes into your open change request for that environment, or a new one, and builds on what you already have waiting there for the flag, so a follow-up changes the waiting change instead of adding a second one. A new change request is sent for review. A draft you already had is not submitted, so you can submit it in Unleash when it's ready, and adding to one in review or approved resets its approvals. Archiving a flag whose archive is already waiting adds nothing.

### Create flag

The `create_flag` tool creates a new feature flag in Unleash with comprehensive validation and progress tracking. 

#### When to use

Use this tool when you have already determined that a feature flag is required (for example, after running `evaluate_change`) and you are ready to create it with the correct type and metadata.

#### Parameters

The tool accepts the following parameters:
- `name` (required): Unique feature flag name within the project.
- `type` (required): Feature flag type indicating lifecycle and intent.
  - `release`: Gradual feature rollouts to users.
  - `experiment`: A/B tests and experiments.
  - `operational`: System behavior and operational toggles.
  - `kill-switch`: Emergency shutdowns or circuit breakers.
  - `permission`: Control feature access based on user roles or entitlements.
- `description` (required): Clear explanation of what the flag controls and why it exists.
- `projectId` (optional): Target project (defaults to `UNLEASH_DEFAULT_PROJECT`).
- `impressionData` (optional): Enable analytics tracking (defaults to false).

#### Usage example

**Agent prompt**

```
Use create_flag with:
- name: "new-checkout-flow"
- type: "release"
- description: "Gradual rollout of the redesigned checkout experience"
- projectId: "ecommerce"
```

**Tool payload**
```json
{
  "name": "new-checkout-flow",
  "type": "release",
  "description": "Gradual rollout of the redesigned checkout experience with improved conversion tracking",
  "projectId": "ecommerce",
  "impressionData": true
}
```

**Tool output**

On success, the tool returns a JSON object containing the new feature flag's URL in the Unleash Admin UI, its MCP resource URI, creation timestamp, and configuration details.

### Evaluate change

The `evaluate_change` tool evaluates whether a code change should be behind a feature flag. It examines the structure, context, and potential risk of the change and returns a recommendation with an explanation and next steps.

#### When to use

Use `evaluate_change` at the beginning of a feature or modification when you want to understand whether the work requires a feature flag. This tool is also helpful when you are unsure which flag type to use or want guidance on rollout planning.

#### How it works
The tool returns detailed, markdown-formatted guidance for the LLM assistant based on [Unleash best practices](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale).

The guidance includes:
- **Parent flag detection**: Checks if code is already protected by existing flags.
- **Risk assessment**: Analyzes code patterns to identify risky operations.
- **Code type evaluation**: Classifies the change (for example, test, config, feature, or bug fix).
- **Recommendation**: Suggests whether to create a flag, use an existing flag, or skip the flag.
- **Next actions**: Provides specific instructions on what to do next.

When `evaluate_change` determines a flag is needed, it provides explicit instructions to:

1. Call `create_flag` tool to create the feature flag.
2. Call `wrap_change` tool to get language-specific code wrapping guidance.
3. Implement the wrapped code following the detected patterns.

**The evaluation process**

The tool follows a clear evaluation process:

```
Step 1: Gather code changes (git diff, read files)
        ↓
Step 2: Check for parent flags (avoiding nesting)
        ↓
Step 3: Assess code type (test? config? feature?)
        ↓
Step 4: Evaluate risk (auth? payments? API changes?)
        ↓
Step 5: Calculate risk score
        ↓
Step 6: Make recommendation
        ↓
Step 7: Take action (create flag or proceed without)
```

**Risk assessment**

The tool uses language-agnostic patterns to score risk:
- **Critical risk** (Score +5): For example, auth, payments, security, and database operations.
- **High risk** (Score +3): For example, API changes, external services, or new classes.
- **Medium risk** (Score +2): For example, async operations or state management.
- **Low risk** (Score +1): For example, bug fixes, refactors, or small changes.

Scores accumulate across matched categories. The total maps to a risk level:
- **Critical**: Score ≥ 5
- **High**: Score ≥ 3
- **Medium**: Score ≥ 2
- **Low**: Score < 2

The output includes a `confidence` score (0-1) representing the LLM's self-assessed certainty, which increases with more context provided.

An **excluded** category covers files that do not need feature flags regardless of content: test files (`*.test.ts`, `*_test.go`, etc.), configuration files (`*.config.js`, `.env`, `*.yaml`), and documentation files (`*.md`, `docs/**`). Changes limited to excluded files will not trigger a flag recommendation.

The full pattern definitions, including per-category keywords, file globs, code patterns, and reasoning, are in [`src/evaluation/riskPatterns.ts`](src/evaluation/riskPatterns.ts).

**Parent flag detection**

The tool looks for common patterns across languages, such as:
- **Conditionals**: `if (isEnabled('flag'))`, `if client.is_enabled('flag'):`
- **Assignments**: `const enabled = useFlag('flag')`
- **Hooks**: `const enabled = useFlag('flag')` → `{enabled && <Component />}`
- **Guards**: `if (!isEnabled('flag')) return;`
- **Wrappers**: `withFeatureFlag('flag', () => {...})`

#### Parameters

All parameters are optional, but more context leads to better recommendations:
- `repository` (string): Repository name or path.
- `branch` (string): Current branch name.
- `files` (array): List of files being changed.
- `description` (string): Description of the change.
- `riskLevel` (enum): `low`, `medium`, `high`, or `critical`, as assessed by the user.
- `codeContext` (string): Surrounding code for parent flag detection.

#### Usage example

**Agent prompt**

Simple usage where you let the agent gather context:
```
Use evaluate_change to help me determine if I need a feature flag
```

Explicit instructions:
```
Use evaluate_change with:
- description: "Add Stripe payment processing"
- riskLevel: "high"
```

**Tool payload**

```json
{
  "repository": "my-app",
  "branch": "feature/stripe-integration",
  "files": ["src/payments/stripe.ts"],
  "description": "Add Stripe payment processing",
  "riskLevel": "high",
  "codeContext": "surrounding code for parent flag detection"
}
```

**Tool output**

Returns a JSON object with the evaluation result, including a `needsFlag` boolean, a `recommendation` (e.g., "create_new"), a suggested flag name, risk level, and a detailed `explanation`.

```json
{
  "needsFlag": true,
  "reason": "new_feature",
  "recommendation": "create_new",
  "suggestedFlag": "stripe-payment-integration",
  "riskLevel": "critical",
  "riskScore": 5,
  "explanation": "This change integrates Stripe payments, which is critical risk...",
  "confidence": 0.9
}
```

### Detect flag

The `detect_flag` tool finds existing feature flags in the codebase so you can reuse them instead of creating duplicates. This tool is automatically integrated into the `evaluate_change` workflow but can also be used manually.

#### When to use

Use this tool before creating a new feature flag or during code evaluation to check for existing flags that might already cover your use case. This helps prevent flag duplication.

#### How it works

The tool returns comprehensive search instructions and uses multiple detection strategies:
- **File-based detection**: Search in files you're modifying for existing flags.
- **Git history analysis**: Look for recently added flags in commit history.
- **Semantic name matching**: Match descriptions to existing flag names.
- **Code context analysis**: Inspect code around the change.

The tool then follows a scoring process:

```
Step 1: Execute file-based search (grep for flag patterns in target files)
        ↓
Step 2: Search git history for recent flag additions
        ↓
Step 3: Perform semantic matching (description → flag names)
        ↓
Step 4: Analyze code context (if provided)
        ↓
Step 5: Combine scores from all methods
        ↓
Step 6: Return best candidate with confidence score
```

**Confidence levels**

The tool returns candidates with confidence scores:

- High `≥0.7`: Strong match; reuse is recommended.
- Medium `0.4-0.7`: Possible match; review manually.
- Low `<0.4`: Weak match; likely create a new flag.

#### Parameters

- `description` (required): Description of the change or feature. For example, `"payment processing with Stripe"`, `"new checkout flow"`.
- `files` (optional): Files being modified. For example, `["src/payments/stripe.ts", "src/checkout/flow.ts"]`.
- `codeContext` (optional): Nearby code to scan for flags.

#### Usage example

**Agent prompt**

Check for existing flags before creating a flag:
```
Use detect_flag with description "payment processing with Stripe"
```

Integrated automatically in evaluation:
```
Use evaluate_change - automatically searches for existing flags
```

**Tool payload**

```json
{
  "description": "payment processing with Stripe",
  "files": ["src/payments/stripe.ts"]
}
```

**Tool output**

Returns a JSON object indicating if a flag was found. If `flagFound` is true, it includes a `candidate` object with the flag's name, location, confidence score, and the reason for the match.

Match found:
```json
{
  "flagFound": true,
  "candidate": {
    "name": "stripe-payment-integration",
    "location": "src/payments/stripe.ts:42",
    "context": "if (client.isEnabled('stripe-payment-integration')) {",
    "confidence": 0.85,
    "reasoning": "Found in same file you're modifying, added 2 days ago",
    "detectionMethod": "file-based"
  }
}
```

No match found:

```json
{
  "flagFound": false,
  "candidate": null
}
```

### Wrap change

The tool `wrap_change` generates language-specific code snippets and guidance for wrapping code with feature flags. It helps LLMs and developers follow existing patterns in the codebase and use flags correctly.

#### When to use
Use this tool after you have created a feature flag (with `create_flag`) and need to implement it in your code. It's especially useful when you want to ensure you are following existing codebase patterns or need framework-specific examples (e.g., React, Django).

#### How it works

This tool is the final step in the `evaluate_change` → `create_flag` → `wrap_change` workflow.

The tool provides the following guidance in its response:
1. **Search instructions**: Step-by-step guide for finding existing flag patterns in your codebase using grep.
2. **Pattern detection**: Identifies common patterns (for example, imports, client variable names, method names, or wrapping styles).
3. **Default templates**: Fallback code snippets if no patterns are found.
4. **Framework-specific examples**: Specialized patterns for React, Express, Django, and others.
5. **Multiple patterns**: If-blocks, guard clauses, hooks, decorators, middleware, and more.

**Supported languages and frameworks:**

- **TypeScript/JavaScript**: Node.js, React Hooks, Express middleware.
- **Python**: FastAPI, Django, Flask decorators.
- **Go**: Standard if-blocks, HTTP middleware.
- **Ruby**: Rails controllers.
- **PHP**: Laravel controllers.
- **C#**: .NET/ASP.NET controllers.
- **Java**: Spring Boot.
- **Rust**: Actix/Rocket handlers.

#### Parameters

- `flagName` (required): Feature flag name to wrap the code with. For example: `"new-checkout-flow"`, or `"stripe-integration"`.
- `language` (optional): Programming language (auto-detected from `fileName` if not provided). Supported: `typescript`, `javascript`, `python`, `go`, `ruby`, `php`, `csharp`, `java`, `rust`
- `fileName` (optional): File name being modified (helps detect language), For example: `"checkout.ts"`, `"payment.py"`, or `"handler.go"`.
- `codeContext` (optional): Surrounding code to help detect existing patterns.
- `frameworkHint` (optional): Framework for specialized templates. For example, `"React"`, `"Express"`, `"Django"`, `"Rails"`, or `"Spring Boot"`.


#### Usage example

**Agent prompt**

```
Use wrap_change with:
- flagName: "new-checkout-flow"
- fileName: "src/components/checkout.ts"
- frameworkHint: "React"
```

**Tool payload**

```json
{
  "flagName": "new-checkout-flow",
  "fileName": "checkout.ts",
  "frameworkHint": "React"
}
```

**Tool output**

Returns a comprehensive, markdown-formatted string that guides the user on how to wrap their code. This includes a quickstart, search instructions, wrapping instructions with placeholders, all available templates for the language, and links to SDK documentation.

```markdown
# Feature Flag Wrapping Guide: "new-checkout-flow"

**Language:** TypeScript
**Framework:** React

## Quick Start
[Recommended pattern with import and usage]

## How to Search for Existing Flag Patterns
[Step-by-step Grep instructions]

## How to Wrap Code with Feature Flag
[Wrapping instructions with examples]

## All Available Templates
[If-block, guard clause, hooks, ternary, etc.]
```

### Set flag rollout

The `set_flag_rollout` tool sets who gets a feature flag in one or more environments: a rollout percentage, optionally narrowed to [segments](https://docs.getunleash.io/concepts/segments) and to [constraints](https://docs.getunleash.io/concepts/activation-strategies#constraints) on context fields, and whether each environment is on.

It checks the whole request before changing anything: every environment, segment name, context field and constraint value. When a segment name or the strategy to change is unclear, it asks the user to pick from a list, if the MCP client can show forms. Otherwise the error lists the valid options for the agent to put to the user.

In each environment:
- With no strategies, it adds a `flexibleRollout` strategy when the entry sets any strategy field. The rollout defaults to 100% of the targeted users, and stickiness defaults to `default`. An entry with only `enabled: true` adds nothing, so Unleash gives the environment the project's default strategy.
- With one `flexibleRollout` strategy, it updates that strategy. Fields you leave out keep their value, so `{ rolloutPercentage: 100 }` moves a rollout to 100% and keeps its segments, constraints, stickiness and variants.
- With several, it needs `strategyId`.
- It saves the strategy before turning the environment on, so Unleash doesn't add the project's default strategy next to it. Turning an environment off happens before the save, so the new strategy never goes live there.
- Turning on an environment whose strategies are all disabled turns them all back on.

#### When to use

Use it after `create_flag` to roll the flag out, and later to change who gets it, such as moving from 30% to 100%.

#### Parameters

- `featureName` (required): Feature flag name.
- `projectId` (optional): Project ID (defaults to `UNLEASH_DEFAULT_PROJECT`).
- `environments` (required): One entry per environment, each with:
  - `environment` (required): Environment name, such as `"production"`.
  - `rolloutPercentage` (optional): Percentage of the targeted users who get the flag (0-100).
  - `segments` (optional): Segment names, as the user said them. Case, spaces and hyphens don't matter. `[]` removes all segments.
  - `constraints` (optional): Constraints, each with `contextName`, `operator` (any Unleash constraint operator), `values` or `value`, `inverted` and `caseInsensitive`. `[]` removes all constraints.
  - `strategyId` (optional): The strategy to change when the environment has more than one.
  - `strategyMode` (optional): `"update"` (the default) changes an existing strategy. `"add"` adds a new `flexibleRollout` strategy next to the existing ones.
  - `stickiness` (optional): Stickiness field. A new strategy uses `"default"`.
  - `groupId` (optional): Group ID for stickiness bucketing. A new strategy uses the flag name.
  - `title` (optional): Descriptive title for the strategy.
  - `strategyDisabled` (optional): Pause the strategy without deleting it. This is not the same as `enabled: false`, which turns the flag off in the environment.
  - `variants` (optional): Strategy variants, each with `name`, `weight` (0-1000), `weightType`, `stickiness` and `payload`. `[]` removes all variants.
  - `enabled` (optional): Turn the environment on or off. `true` also turns on the strategy if it was disabled, unless `strategyDisabled` is passed.

#### Usage example

**Agent prompt**

```
Turn on new-checkout-flow in development, and roll it out to 30% of beta users in production.
```

**Tool payload**

```json
{
  "featureName": "new-checkout-flow",
  "projectId": "ecommerce",
  "environments": [
    { "environment": "development", "enabled": true },
    {
      "environment": "production",
      "rolloutPercentage": 30,
      "segments": ["beta users"],
      "enabled": true
    }
  ]
}
```

**Tool output**

For each environment, it returns whether the strategy was added, updated or left unchanged, whether the environment is on, and the saved rollout percentage, segment names and constraints. An update also shows the previous values. Notes flag anything that limits the rollout, such as the environment being off or other strategies that still apply. The result also links to the flag in the Unleash Admin UI, the Admin API and the flag's MCP resource URI.

#### Errors

If the request has problems, nothing is changed. The error code is `INVALID_ROLLOUT`, and `problems` lists every problem at once, each with its environment, code, message, hint and, where there are any, the valid `options`:

| Code | When |
|---|---|
| `ENVIRONMENT_NOT_FOUND` | The flag has no environment with that name. The options list its environments. |
| `DUPLICATE_ENVIRONMENT` | The same environment appears in more than one entry. |
| `SEGMENT_NOT_FOUND` | No segment the project can use matches the name, several do, or the match belongs to another project. The options list the names that matched, or else every segment the project can use. |
| `CONTEXT_FIELD_NOT_FOUND` | The project has no context field with that name. The hint gives the right name when only the case differs, and otherwise links to where the field can be created. The options list the project's fields. |
| `INVALID_CONSTRAINT` | A constraint has no value, or Unleash rejects its value, such as text for `NUM_GT` or a value outside the field's legal values. |
| `STRATEGY_NOT_CHOSEN` | The environment has several `flexibleRollout` strategies and no `strategyId`, or `strategyId` matches none of them. The options list them. |
| `STRATEGY_NOT_FOUND` | `strategyId` matches no strategy, and the environment has no `flexibleRollout` strategy to pick from instead. |
| `STRATEGY_CONFLICT` | The entry sets both `strategyMode: "add"` and `strategyId`. |
| `STRATEGY_NOT_SUPPORTED` | The strategy to change is not a `flexibleRollout` strategy. |
| `LAST_STRATEGY_PAUSED` | `strategyDisabled: true` would pause the only active strategy in an environment that stays on. Unleash turns an environment off when its last active strategy is paused, and turning it on again adds the project's default strategy. |

Other errors:
- `VALIDATION_ERROR` for a field the tool doesn't know, such as a misspelt one, so it is never ignored.
- `HTTP_404` when the flag is not in the project. The hint points to `create_flag` and `search_flags`.
- If saving fails partway through, the error keeps Unleash's code and adds `failedEnvironment`, `applied` (the environments that were saved or sent for review) and `notChanged`.

### Create targeting

The `create_targeting` tool creates [context fields](https://docs.getunleash.io/concepts/unleash-context) and [segments](https://docs.getunleash.io/concepts/segments) for `set_flag_rollout` to target. Context fields are created before segments, so one call can create a field and a segment that constrains on it.

Everything belongs to the project by default. `scope: "global"` makes it usable in every project, and cannot be combined with `projectId`. Project context fields need Unleash 7.4.1 or later. Context field and segment names are unique across the whole instance.

Nothing is created until every name and constraint checks out. Each item is then its own API call and nothing is rolled back. A failure partway through stops the call, and the error lists what was `created`, the `failed` item and what was `notAttempted`.

#### Parameters

- `projectId` (optional): Project that owns what is created (defaults to `UNLEASH_DEFAULT_PROJECT`).
- `scope` (optional): `"project"` (default) or `"global"`.
- `contextFields` (optional): Fields, each with `name`, `description`, `legalValues`, `stickiness` and `sortOrder`. A name is URL-friendly and at most 100 characters.
- `segments` (optional): Segments, each with `name`, `description` and `constraints` (same shape as in `set_flag_rollout`).

#### Usage example

**Tool payload**

```json
{
  "projectId": "ecommerce",
  "contextFields": [{ "name": "plan" }],
  "segments": [
    {
      "name": "enterprise customers",
      "constraints": [{ "contextName": "plan", "operator": "IN", "values": ["enterprise"] }]
    }
  ]
}
```

**Tool output**

`scope`, `project` (for project scope) and `created`, a list of the context fields and segments with their `kind` and `name`.

#### Errors

If the request has problems, nothing is created. The error code is `INVALID_TARGETING`, and `problems` lists every problem at once, each with the `kind` and `name` of its item, code, message, hint and, where there are any, the valid `options`:

| Code | When |
|---|---|
| `DUPLICATE_NAME` | The same context field or segment name appears more than once. |
| `CONTEXT_FIELD_EXISTS` | A context field with that name exists, in any project. The message says which project owns it. |
| `SEGMENT_EXISTS` | A segment with that name exists, in any project. |
| `CONTEXT_FIELD_NOT_FOUND` | A segment constraint names a field that neither exists nor is created in the same call. The hint says when another project owns the name. The options list the fields the segment can use. |
| `INVALID_CONSTRAINT` | A constraint has no value, or Unleash rejects its value, such as text for `NUM_GT` or a value outside the field's legal values. |

Other errors, also before anything is created:
- `INVALID_SCOPE`: `scope: "global"` comes with a `projectId`.
- `PROJECT_NOT_FOUND`: the project does not exist. The hint points to `list_projects`.
- `VALIDATION_ERROR`: a context field breaks Unleash's limits: a name that is not URL-friendly or is over 100 characters, a description over 250, or a legal value over 100 or repeated.
- `HTTP_404`: Unleash is older than 7.4.1, so it has no project context fields. The hint suggests `scope: "global"`. Project segments still work on older versions.

If creating fails partway through, the error keeps Unleash's code and adds `failed`, `created` and `notAttempted`.

### Get flag state

The `get_flag_state` tool fetches a feature flag's current metadata and environment strategies from the Unleash Admin API. It returns the flag's type, enabled/archived status, impression data setting, and each environment's strategies and variants.

#### When to use

Use this tool to inspect a flag before modifying it, to check how many strategies are active across environments, or to find strategy IDs before calling `remove_flag_strategy`.

#### Parameters

- `featureName` (required): Feature flag name.
- `projectId` (optional): Project ID (defaults to `UNLEASH_DEFAULT_PROJECT`).
- `environment` (optional): Filter results to a single environment (case-insensitive).
- `includeSegments` (optional): Also return the segments that the strategies in the matching environments use.
- `includeContextFields` (optional): Also return the context fields that constraints in the flag's project can use.

#### Usage example

**Agent prompt**

```
Use get_flag_state with:
- featureName: "new-checkout-flow"
- environment: "production"
```

**Tool payload**

```json
{
  "featureName": "new-checkout-flow",
  "projectId": "ecommerce",
  "environment": "production"
}
```

**Tool output**

Returns a JSON object with the full feature object (all environments and strategy details), the environments matching the filter, and UI and API links.

Strategies list their segments only by ID. When the matching environments use segments, the output includes a `hint` naming them. With `includeSegments`, it instead includes `segments`, each with its `id`, `name`, `description`, `project`, and the `constraints` that decide who it includes. Segments that could not be fetched are listed under `segmentErrors`, each with the `error` Unleash gave, and do not fail the call.

With `includeContextFields`, the output includes `contextFields`: the root context fields plus the project's own, each with its `name`, `description`, `legalValues`, whether it can set rollout `stickiness`, and the `project` it belongs to if it is project-specific.

### Evaluate flag

The `evaluate_flag` tool evaluates a single feature flag against an Unleash context in an environment, using the Unleash playground API. It returns whether the flag is enabled for that context, the variant it resolves to, and a per-strategy breakdown listing the constraints and segments that did not match. The project is resolved from the flag name.

> **Alpha:** this tool uses `POST /api/admin/playground/features/{featureName}`, an alpha Unleash API that may change. It requires an Unleash version that provides this endpoint.

#### When to use

Use this tool to answer questions like "is `show-new-checkout` on for user `asdf`?" or to debug why a flag is off for a specific user. Use `get_flag_state` to inspect a flag's configuration instead.

#### Parameters

- `featureName` (required): Feature flag name.
- `environment` (optional): Environment to evaluate in (defaults to `UNLEASH_DEFAULT_ENVIRONMENT`; required if that is not set).
- `context` (optional): A flat Unleash context object. `userId`, `sessionId`, `remoteAddress`, `currentTime`, and `appName` are sent as standard fields; any other key (for example `tier`) is sent as a custom context property. Numbers and booleans are converted to strings. A nested `properties` object is also accepted.
- `appName` (optional): Application name for the context (default: `unleash-mcp`).

#### Usage example

**Agent prompt**

```
Use evaluate_flag to check whether "show-new-checkout" is enabled in production
for userId "asdf" on the "top" tier.
```

**Tool payload**

```json
{
  "featureName": "show-new-checkout",
  "environment": "production",
  "context": { "userId": "asdf", "tier": "top" }
}
```

**Tool output**

Returns a text summary with the result (`ENABLED`, `DISABLED`, or `UNKNOWN` when a custom strategy cannot be evaluated), the variant, warnings when the flag is off in the environment or has an unsatisfied dependency, each strategy's outcome with its failing constraints and segments, the context that was sent, and a link to the flag in the Unleash Admin UI. The structured output includes the full playground response.

### Get flag history

The `get_flag_history` tool fetches the most recent change events for a feature flag from the Unleash event log, newest first. Instead of returning each event's full before and after payloads, it computes a structural diff inside the tool and returns only the changed fields, so the agent reads the change itself without having to diff two large objects.

#### When to use

Use this tool before editing or toggling a flag to see what changed recently and who changed it, or to explain why a flag is in its current state. Pair it with `get_flag_state` when the current configuration alone does not answer the question.

#### Parameters

- `featureName` (required): Feature flag name.
- `limit` (optional): Maximum number of most recent changes to return, between 1 and 100 (default: 20).

#### Usage example

**Agent prompt**

```
Use get_flag_history with:
- featureName: "new-checkout-flow"
- limit: 10
```

**Tool payload**

```json
{
  "featureName": "new-checkout-flow",
  "limit": 10
}
```

**Tool output**

Returns a JSON object with `featureName`, `total` (every change on record for the flag), and `events`. Each event has `createdAt`, `createdBy`, `type`, `environment`, and `changes`: a list of changed leaves with `path` (for example `["parameters", "rollout"]`), `before`, and `after`. Added fields have `before: undefined`, removed fields have `after: undefined`. Fields that change on their own, such as `createdAt` and `lastSeenAt`, are stripped from the diff. Events with no payload, such as enabling or disabling an environment, have an empty `changes` list; the `type` describes them. When `total` is larger than the number of events returned, raise `limit`.

### List flags

The `list_flags` tool enumerates the feature flags in a project and returns a structured inventory with pagination and sort order. Active and archived flags are returned separately: call it once with `archived: false` (the default) and once with `archived: true` to assemble a full inventory for audit workflows.

#### When to use

Use this tool when an agent needs to discover which flags already exist, for example to audit a project, find candidates for cleanup, or build context before creating or wrapping a flag. It is the agent-invokable equivalent of the `unleash://projects/{projectId}/feature-flags` resource (see [MCP resources](#mcp-resources)).

#### Parameters

- `projectId` (optional): Project to list flags from (defaults to `UNLEASH_DEFAULT_PROJECT`; auto-resolved when a single project exists).
- `archived` (optional): `true` to list archived flags instead of active ones. Defaults to `false`. Active and archived flags cannot be returned in the same response.
- `limit` (optional): Maximum flags per page (default: server page size, typically 50).
- `order` (optional): Sort order by flag name, `asc` or `desc` (default: `asc`).
- `offset` (optional): Number of flags to skip for pagination (default: 0).

#### Usage example

**Agent prompt**

```
Use list_flags with:
- projectId: "ecommerce"
- archived: false
```

**Tool payload**

```json
{
  "projectId": "ecommerce",
  "archived": false,
  "limit": 50,
  "order": "asc"
}
```

**Tool output**

Returns a JSON object with `projectId`, `archived`, `order`, `limit`, `offset`, `nextOffset`, `totalFlags`, and the `flags` array (each with name, type, project, archived status, and links). Use `nextOffset` to page through large projects.

### Search flags

The `search_flags` tool searches active feature flags in all projects by part of their name or description. Given a flag's full name, it returns that flag and the project it is in, which the other flag tools need as `projectId`.

#### Parameters

- `query` (required): Part of a flag name or description, or a full flag name.

#### Tool output

Returns a JSON object with `total`, the number of matching flags, and `flags`. Each flag has its name, project, type, description, whether it is stale, and whether it is enabled in each environment. When `total` is larger than the number of flags returned, a longer query narrows the results.

### List projects

The `list_projects` tool enumerates the Unleash projects available to the configured token, with pagination and sort order.

#### When to use

Use this tool when the target project is unknown, or when an agent needs to pick a project before listing or creating flags. It is the agent-invokable equivalent of the `unleash://projects` resource (see [MCP resources](#mcp-resources)).

#### Parameters

- `limit` (optional): Maximum projects per page (default: server page size, typically 20).
- `order` (optional): Sort order by project creation time, `asc` or `desc` (default: `desc`, newest first).
- `offset` (optional): Number of projects to skip for pagination (default: 0).

#### Usage example

**Agent prompt**

```
Use list_projects to see which projects are available.
```

**Tool payload**

```json
{
  "limit": 20,
  "order": "desc"
}
```

**Tool output**

Returns a JSON object with `order`, `limit`, `offset`, `nextOffset`, `totalProjects`, and the `projects` array (each with id, name, description, creation time, and URL).

### Toggle flag environment

The `toggle_flag_environment` tool enables or disables a feature flag in a specific environment. For gradual rollouts, configure a strategy with `set_flag_rollout` before enabling.

#### When to use

Use this tool to turn a flag on after configuring a rollout strategy, or to disable a flag during an incident or after completing a rollout.

#### Parameters

- `featureName` (required): Feature flag name.
- `environment` (required): Environment to toggle (for example, `"production"`).
- `enabled` (required): `true` to enable, `false` to disable.
- `projectId` (optional): Project ID (defaults to `UNLEASH_DEFAULT_PROJECT`).

#### Usage example

**Agent prompt**

```
Use toggle_flag_environment with:
- featureName: "new-checkout-flow"
- environment: "production"
- enabled: true
```

**Tool payload**

```json
{
  "featureName": "new-checkout-flow",
  "environment": "production",
  "enabled": true,
  "projectId": "ecommerce"
}
```

**Tool output**

Returns a JSON object with the new enabled state, the updated feature object, and links to the flag in the Unleash Admin UI and Admin API.

### Remove flag strategy

The `remove_flag_strategy` tool deletes a strategy configuration from a feature flag environment. Use `get_flag_state` first to discover the strategy ID.

#### When to use

Use this tool to clean up stale strategies, or to replace a strategy that `set_flag_rollout` can't change (one that isn't a `flexibleRollout`) by removing it and calling `set_flag_rollout` again.

#### Parameters

- `featureName` (required): Feature flag name.
- `environment` (required): Environment from which to remove the strategy.
- `strategyId` (required): ID of the strategy to remove (find this via `get_flag_state`).
- `projectId` (optional): Project ID (defaults to `UNLEASH_DEFAULT_PROJECT`).

#### Usage example

**Agent prompt**

```
Use get_flag_state to find strategy IDs for "new-checkout-flow" in production,
then use remove_flag_strategy to delete the old strategy.
```

**Tool payload**

```json
{
  "featureName": "new-checkout-flow",
  "environment": "production",
  "strategyId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "projectId": "ecommerce"
}
```

**Tool output**

Returns a JSON object with the removed strategy ID, the count of remaining strategies in the environment, the updated feature object, and links to the flag in the Unleash Admin UI and Admin API.

### Update flag lifecycle

The `update_flag_lifecycle` tool moves a feature flag through its lifecycle. Unleash sets the `initial`, `pre-live`, and `live` stages from SDK metrics, so this tool only changes what the API allows: completing, archiving, and undoing either, plus the stale marker.

#### When to use

Use this tool when a flag's job is done. The recommended order is: `complete`, then `cleanup_flag` to remove the flag from code, then `archive`.

#### Parameters

- `featureName` (required): Feature flag name.
- `action` (required): One of:
  - `complete`: marks the flag as completed. Requires `status`.
  - `uncomplete`: undoes `complete`.
  - `archive`: archives the flag so SDKs stop receiving it. Refused when other flags depend on it.
  - `revive`: restores an archived flag.
  - `mark_stale` / `unmark_stale`: sets or clears the stale marker, which is independent of the stage.
- `status` (required for `complete`): `"kept"` if the feature stays in the product, `"discarded"` if it was removed.
- `statusValue` (optional): Detail for `complete`, for example the variant that was kept.
- `projectId` (optional): Project ID. When omitted, the tool finds the project from the flag name, since flag names are unique across projects.

#### Usage example

**Agent prompt**

```
The new checkout flow is fully rolled out. Mark "new-checkout-flow" as completed and kept.
```

**Tool payload**

```json
{
  "featureName": "new-checkout-flow",
  "action": "complete",
  "status": "kept",
  "projectId": "ecommerce"
}
```

**Tool output**

Returns a JSON object with `changed`, the flag's lifecycle state `before` and `after` the call, a one-line `summary`, and `help` with the next tool calls. When the flag reaches `completed` or `archived`, `help` suggests calling `cleanup_flag`, with `preservePath` set from the completion status (`kept` keeps the enabled path, `discarded` keeps the disabled path). When the flag was already in the requested state, `changed` is `false` and nothing is modified.

### Cleanup flag

The `cleanup_flag` tool generates step-by-step instructions for safely removing feature flag code from the codebase while preserving the desired code path.

#### When to use

Use this tool when a feature flag has completed its lifecycle:
- After a rollout reaches 100% and the flag is no longer needed.
- When deprecating an experimental feature (preserve the disabled path).
- When removing a kill switch that is no longer necessary.
- During technical debt cleanup of old flags.

#### How it works

The tool returns comprehensive cleanup instructions that guide the LLM through:
1. Finding all occurrences of the flag using grep patterns.
2. Identifying usage patterns (if-else blocks, ternary expressions, guard clauses, hooks, decorators, middleware).
3. Removing flag checks while preserving the correct code path.
4. Cleaning up unused imports with language-specific guidance.
5. Verifying changes with post-cleanup search and test steps.

If `preservePath` is not provided, the tool returns instructions to ask the user which path to keep before proceeding.

#### Parameters

- `flagName` (required): Name of the feature flag to remove (for example, `"new-checkout-flow"`).
- `preservePath` (optional): `"enabled"` to keep the flag-on code path (typical for completed rollouts), or `"disabled"` to keep the flag-off path (for removed experiments). If omitted, the tool prompts you to ask the user.
- `files` (optional): Specific files to clean up. If omitted, searches the entire codebase.
- `language` (optional): Programming language for specialized import cleanup guidance (for example, `"typescript"`, `"python"`). Auto-detected from `files` if not provided.

#### Usage example

**Agent prompt**

```
Use cleanup_flag with:
- flagName: "new-checkout-flow"
- preservePath: "enabled"
```

**Tool payload**

```json
{
  "flagName": "new-checkout-flow",
  "preservePath": "enabled",
  "files": ["src/components/checkout.tsx", "src/api/checkout.ts"],
  "language": "typescript"
}
```

**Tool output**

Returns a markdown guide covering the cleanup scope and preserved path, grep commands to find all occurrences, per-pattern removal instructions, language-specific import cleanup, and post-cleanup verification steps (re-search, run tests, manual review).

### Send feedback

The `send_feedback` tool reports a moment where this MCP fell short. Reports go to an Unleash-hosted instance and help prioritise fixes and new tools.

#### When to use

The assistant should call this tool before replying to the user when one of these happens:
- `tool_error`: a tool call returned an error (except authentication errors, HTTP 401 or 403).
- `unsupported_action`: the user asked for something no tool can do.
- `unexpected_result`: a tool succeeded but its result was not what was expected.

Never call it after a successful tool call, and never to report a failure of `send_feedback` itself.

#### Consent

Nothing is sent until the user opts in. On the first call the MCP asks the user through an MCP [elicitation](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation) prompt and stores the answer in `feedback_consent.json`, so the question is asked only once. The file lives in the platform config directory:

- `$XDG_CONFIG_HOME/unleash-mcp/feedback_consent.json` when `XDG_CONFIG_HOME` is set (any platform).
- macOS: `~/Library/Application Support/unleash-mcp/feedback_consent.json`
- Linux: `~/.config/unleash-mcp/feedback_consent.json`
- Windows: `%APPDATA%\unleash-mcp\feedback_consent.json` (or `~\AppData\Roaming\unleash-mcp\feedback_consent.json` when `APPDATA` is unset)

Set `UNLEASH_MCP_CONFIG_DIR` to keep the file in a different directory. Delete the file to be asked again.

If the user declines, the tool returns a message saying feedback is disabled and the assistant should not call it again in that session. If the client does not support elicitation, or the prompt is cancelled or not answered within 60 seconds, feedback stays disabled for the current session and nothing is stored, so the question is asked again in the next session.

Set `UNLEASH_MCP_SEND_FEEDBACK=true` or `UNLEASH_MCP_SEND_FEEDBACK=false` to grant or deny consent without a prompt. The environment variable overrides the consent file. This is useful for clients that do not support elicitation and for CI setups. When consent is denied this way, the `send_feedback` tool is left out of the tool list and the server instructions do not mention it, so the assistant never attempts to call it.

OpenCode and Google Gemini or Antigravity never show the prompt to the user (OpenCode auto-accepts, Antigravity cancels). For these clients, and for clients that report no name, the server skips the prompt and ignores the consent file, since a stored grant may not have come from the user. Feedback stays off unless `UNLEASH_MCP_SEND_FEEDBACK=true` is set. All other clients use the decision stored in the consent file.

When the server is embedded in an HTTP host through `createMcpHandler`, consent defaults to denied unless the host passes `feedbackConsent`, so `send_feedback` is not exposed to remote clients by default.

#### What is recorded

Only allowlisted fields are sent:
- Issue type, tool name, and normalized error code.
- MCP version, client name, and client version.
- The short summary provided by the assistant.

The summary must not contain flag names, project IDs, code, URLs, or tokens. Raw error messages are never sent.

#### Parameters

- `issueType` (required): `tool_error`, `unsupported_action`, or `unexpected_result`.
- `summary` (required): One or two sentences describing what went wrong or what was requested (max 500 characters).
- `tool` (optional): Name of the MCP tool involved, for example `create_flag`. Omit for unsupported requests.
- `errorCode` (optional): Normalized error code from the failed tool result, for example `HTTP_500` or `VALIDATION_ERROR`.

#### Usage example

**Agent prompt**

```
The set_flag_rollout call failed with HTTP_500. Use send_feedback to report it,
then tell me what happened.
```

**Tool payload**

```json
{
  "issueType": "tool_error",
  "tool": "set_flag_rollout",
  "errorCode": "HTTP_500",
  "summary": "Configuring a gradual rollout failed with a server error even though the flag exists in the environment."
}
```

**Tool output**

Returns a JSON object with `success`, `sent`, `dryRun`, and a `message` confirming that feedback was sent (or would be sent in `--dry-run` mode), or saying that feedback is disabled because the user has not opted in.

## MCP resources

The server registers MCP [resources](https://modelcontextprotocol.io/docs/concepts/resources) for reading project and feature flag data. All resources return JSON and are cached for 60 seconds.

| URI template | Description |
|---|---|
| `unleash://projects{?limit,order,offset}` | List projects. Default page size: 20, sorted by creation time (newest first). |
| `unleash://projects/{projectId}/feature-flags{?limit,order,offset}` | List flags in a project. Default page size: 50, sorted alphabetically. |
| `unleash://projects/{projectId}/feature-flags/{flagName}` | Single feature flag metadata. |

The first two templates accept optional query parameters: `limit` (page size), `order` (`asc` or `desc`), and `offset` (pagination start). Responses include `fetchedAt`, `cached`, `totalProjects` or `totalFlags`, and `nextOffset` fields.

> **Resources vs. tools:** MCP resources are application-controlled, so many clients only surface them through user-driven UI (for example `#`-mentions) and do not let the agent call `resources/read` on its own. When an agent needs to enumerate projects or flags programmatically, use the `list_projects` and `list_flags` tools, which return the same data through the tool interface. The `detect_flag` inventory analysis routes through the same path.

**Example resource read**

```
Read unleash://projects/ecommerce/feature-flags?limit=10&order=asc
```

Returns the first 10 feature flags in the `ecommerce` project, sorted alphabetically, with pagination metadata.

## Architecture

The server follows a focused, purpose-driven design.

### Structure

```
src/
├── index.ts                     # Stdio CLI entry point
├── server.ts                    # Transport-agnostic server factory
├── remote.ts                    # HTTP request handler for embedded mode
├── config.ts                    # Configuration loading and validation
├── context.ts                   # Shared runtime context
├── version.ts                   # Version constant
├── unleash/
│   ├── client.ts                # Unleash Admin API client
│   ├── attribution.ts           # Client attribution for outbound headers
│   └── feedbackHttpClient.ts    # send_feedback transport
├── http/
│   └── httpClient.ts            # Generic fetch wrapper for API clients
├── feedback/
│   ├── consentDecision.ts       # granted | denied consent type
│   ├── consentResolver.ts       # Resolves send_feedback consent (env, file, prompt)
│   ├── consentStore.ts          # Persists consent in feedback_consent.json
│   └── elicitation.ts           # MCP elicitation prompt asking the user once
├── tools/
│   ├── types.ts                 # Shared ToolDefinition type
│   ├── createFlag.ts            # create_flag tool
│   ├── evaluateChange.ts        # evaluate_change tool
│   ├── detectFlag.ts            # detect_flag tool
│   ├── wrapChange.ts            # wrap_change tool
│   ├── cleanupFlag.ts           # cleanup_flag tool
│   ├── constraints.ts           # Constraint schema and checks shared by set_flag_rollout and create_targeting
│   ├── createTargeting.ts       # create_targeting tool
│   ├── setFlagRollout.ts        # set_flag_rollout tool
│   ├── getFlagState.ts          # get_flag_state tool
│   ├── listFlags.ts             # list_flags tool
│   ├── listProjects.ts          # list_projects tool
│   ├── searchFlags.ts           # search_flags tool
│   ├── evaluateFlag.ts          # evaluate_flag tool
│   ├── getFlagHistory.ts        # get_flag_history tool
│   ├── toggleFlagEnvironment.ts # toggle_flag_environment tool
│   ├── removeFlagStrategy.ts    # remove_flag_strategy tool
│   ├── updateFlagLifecycle.ts   # update_flag_lifecycle tool
│   └── sendFeedback.ts          # send_feedback tool
├── resources/
│   └── unleashResources.ts      # MCP resource handlers (projects, flags)
├── prompts/
│   └── promptBuilder.ts         # Markdown formatting utilities
├── evaluation/
│   ├── riskPatterns.ts          # Risk assessment patterns
│   └── flagDetectionPatterns.ts # Parent flag detection patterns
├── detection/
│   ├── flagDiscovery.ts         # Flag discovery strategies
│   └── flagScoring.ts           # Scoring and ranking logic
├── knowledge/
│   └── unleashBestPractices.ts  # Best practices knowledge base
├── templates/
│   ├── languages.ts             # Language detection and metadata
│   ├── wrapperTemplates.ts      # Code wrapping templates
│   ├── searchGuidance.ts        # Pattern search instructions
│   └── cleanupGuidance.ts       # Flag cleanup instructions
└── utils/
    ├── errors.ts                # Error normalization
    ├── streaming.ts             # Progress notifications
    ├── toolResult.ts            # JSON tool results
    ├── showsElicitationForms.ts # Clients whose elicitation forms never reach the user
    └── stdioLogging.ts          # Stdio protocol traffic logging
```

### Design principles

- **Thin surface area**: Only the endpoints needed for the core capabilities.
- **Purpose-driven**: Each module serves a specific, well-defined purpose.
- **Explicit validation**: Zod schemas validate all inputs before API calls.
- **Error normalization**: All errors converted to `{code, message, hint}` format.
- **Progress streaming**: Long-running operations provide visibility.
- **Best practices integration**: Guidance from Unleash docs embedded in tool descriptions.

## Configuration

This section provides a quick reference for all configuration options.

**Environment variables:**
- `UNLEASH_BASE_URL`: Your Unleash instance URL (required). Both `https://your-instance.getunleash.io` and `https://your-instance.getunleash.io/api` are accepted — the server normalizes a trailing `/api` away if present, so you can paste the same value most Unleash SDKs expect.
- `UNLEASH_PAT`: Personal access token (required).
- `UNLEASH_DEFAULT_PROJECT`: The default project ID the MCP should use (optional).
- `UNLEASH_MCP_SEND_FEEDBACK`: `true` or `false` to grant or deny `send_feedback` consent without a prompt (optional). Overrides the stored consent file.
- `UNLEASH_FEEDBACK_URL`: Base URL of the Unleash instance that receives `send_feedback` reports (optional). Defaults to the Unleash-hosted production instance.
- `UNLEASH_MCP_CONFIG_DIR`: Directory holding `feedback_consent.json` (optional). Defaults to the platform config directory described in [Consent](#consent).

**CLI flags:**
- `--dry-run`: Simulate operations without making actual API calls.
- `--log-level`: Set logging verbosity (debug, info, warn, error).

## Best practices

This server encourages Unleash best practices from the [official documentation](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale):

### Flag lifecycle

1. **Create with intent**: Choose the right flag type to signal purpose.
2. **Document clearly**: Write descriptions that explain the "why".
3. **Plan for cleanup**: Feature flags are temporary; plan their removal.
4. **Monitor usage**: Enable impression data for important flags.

### Flag types

- **Release flags**: For gradual feature rollouts (remove after full rollout).
- **Experiment flags**: For A/B tests (remove after analysis).
- **Operational flags**: For system behavior (longer-lived, review periodically).
- **Kill switches**: For emergency controls (maintain until feature is stable).
- **Permission flags**: For access control (longer-lived, review permissions).

### Naming conventions

- Use kebab-case: `new-checkout-flow`
- Be descriptive: `enable-ai-recommendations` not `flag1`.
- Include scope when needed: `mobile-push-notifications`.

## API reference

This server uses the Unleash Admin API. For complete API documentation, see:

- [Unleash Admin API OpenAPI Spec](https://app.unleash-hosted.com/hosted/docs/openapi.json)
- [Unleash API Documentation](https://docs.getunleash.io/reference/api/unleash)

### Endpoints used

- `GET /api/admin/projects` - List projects
- `GET /api/admin/projects/{projectId}/features` - List feature flags
- `POST /api/admin/projects/{projectId}/features` - Create feature flag
- `GET /api/admin/projects/{projectId}/features/{featureName}` - Get flag details
- `GET /api/admin/segments/{id}` - Get segment
- `POST /api/admin/segments` - Create segment
- `GET /api/admin/context` - List global context fields
- `GET /api/admin/context/{name}` - Get context field
- `POST /api/admin/context` - Create global context field
- `GET /api/admin/projects/{projectId}/context` - List a project's context fields
- `POST /api/admin/projects/{projectId}/context` - Create project context field
- `GET /api/admin/search/features` - Search feature flags
- `GET /api/admin/search/events` - Fetch a feature flag's change events
- `POST /api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies` - Add rollout strategy
- `DELETE /api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies/{strategyId}` - Remove strategy
- `POST /api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on` - Enable flag
- `POST /api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/off` - Disable flag
- `POST /api/admin/projects/{projectId}/features/{featureName}/lifecycle/complete` - Complete flag
- `POST /api/admin/projects/{projectId}/features/{featureName}/lifecycle/uncomplete` - Uncomplete flag
- `POST /api/admin/projects/{projectId}/archive/validate` - Check dependencies before archiving
- `DELETE /api/admin/projects/{projectId}/features/{featureName}` - Archive flag
- `POST /api/admin/archive/revive/{featureName}` - Revive archived flag
- `POST /api/admin/projects/{projectId}/stale` - Mark flag as stale or not stale
- `GET /api/admin/projects/{projectId}/change-requests/config` - Find the environments that need approval
- `GET /api/admin/user` - Check whether you may skip change requests
- `GET /api/admin/projects/{projectId}/change-requests/pending` - Find your open change requests and the changes waiting in them
- `POST /api/admin/projects/{projectId}/environments/{environment}/change-requests` - Add changes to a change request
- `PUT /api/admin/projects/{projectId}/change-requests/{id}/changes/{changeId}` - Change a strategy that is waiting to be added
- `PUT /api/admin/projects/{projectId}/change-requests/{id}/state` - Send a change request for review

`send_feedback` does not call your Unleash instance. It posts to `POST {UNLEASH_FEEDBACK_URL}/feedback` on the Unleash-hosted feedback instance.

## Troubleshooting

### Configuration issues

**Error: "UNLEASH_BASE_URL must be a valid URL"**: Ensure your base URL is complete, including protocol. For example, `https://app.unleash-hosted.com/instance`. Remove any trailing slashes.

**Error: "UNLEASH_PAT is required"**: Check that your `.env` file exists and contains `UNLEASH_PAT={{your-personal-access-token}}`. Verify that the token is valid in Unleash.

### API issues

**Error: "HTTP_401"**: Your personal access token may be invalid or expired. Generate a new token under **Profile > View Profile settings > Personal API tokens > New token**.

**Error: "HTTP_403"**: Your token doesn't have permission to create flags in this project. Review your role and permissions in Unleash.

**Error: "HTTP_404"**: The project ID doesn't exist. Confirm the project ID in Unleash Admin UI.

**Error: "HTTP_409"**: A flag with this name already exists in the project. Use a different name or reuse the existing flag.

### Feedback issues

**"Feedback is disabled"**: The user declined consent, the client could not show the consent prompt, or `UNLEASH_MCP_SEND_FEEDBACK=false` is set. Set `UNLEASH_MCP_SEND_FEEDBACK=true`, or delete `feedback_consent.json` to be asked again. See [Consent](#consent).

**Error: "Failed to connect to the Unleash feedback endpoint"**: The report could not reach the feedback instance. Check that `UNLEASH_FEEDBACK_URL` (or the default production instance) is reachable from your network. Flag operations are not affected.

## License

MIT

## Contributing

This is a purpose-driven project with a focused scope. Contributions should:

- Align with the existing tool surface and MCP resource model.
- Maintain the thin, purpose-driven architecture.
- Follow Unleash best practices.
- Include clear documentation.
