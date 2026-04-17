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
- **Follow best practices** from the [Unleash documentation](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale).

### Available tools

The MCP server exposes the following tools:

- `create_flag`: Creates a feature flag in Unleash.
- `evaluate_change`: Scores risk and recommends feature flag usage.
- `detect_flag`: Discovers existing feature flags to avoid duplicates.
- `wrap_change`: Provides guidance on how to wrap a change in a feature flag.
- `set_flag_rollout`: Configures rollout strategies for a feature flag (does not enable the flag).
- `get_flag_state`: Surfaces a feature flag's metadata and its activation strategies.
- `list_flags`: Lists all feature flags in a project, with optional pagination and sort order.
- `list_projects`: Lists Unleash projects available to the configured token, with optional pagination.
- `toggle_flag_environment`: Enables or disables a feature flag in an environment.
- `remove_flag_strategy`: Deletes a feature flag's strategy from an environment.
- `cleanup_flag`: Generates instructions for safely removing flagged code paths.

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
npx unleash-mcp --log-level debug
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

## Tool reference

This section describes each of the core tools in detail, including its purpose, parameters, and output.

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

On success, the tool returns a JSON object containing the new feature flag's URL in the Unleash Admin UI, an MCP resource link for programmatic access, creation timestamp, and configuration details.

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

The `set_flag_rollout` tool configures a `flexibleRollout` strategy on a feature flag environment. It sets the rollout percentage, stickiness, and optional strategy-level variants. This does not enable the flag; use `toggle_flag_environment` to turn it on.

#### When to use

Use this tool after creating a flag with `create_flag` to configure how traffic is distributed before enabling it. Also use it to update an existing rollout percentage or add variants.

#### Parameters

- `featureName` (required): Feature flag name.
- `environment` (required): Target environment (for example, `"production"`, `"development"`).
- `rolloutPercentage` (required): Percentage of traffic to receive the feature (0-100).
- `projectId` (optional): Project ID (defaults to `UNLEASH_DEFAULT_PROJECT`).
- `groupId` (optional): Stickiness bucketing key (defaults to the feature name).
- `stickiness` (optional): Stickiness field (defaults to `"default"`).
- `title` (optional): Descriptive title for the strategy.
- `disabled` (optional): Create the strategy in a disabled state (defaults to false).
- `variants` (optional): List of strategy-level variants, each with `name`, `weight` (0-1000), optional `weightType` (`"variable"` or `"fix"`), `stickiness`, and `payload` (`{type, value}`).

#### Usage example

**Agent prompt**

```
Use set_flag_rollout with:
- featureName: "new-checkout-flow"
- environment: "production"
- rolloutPercentage: 25
```

**Tool payload**

```json
{
  "featureName": "new-checkout-flow",
  "environment": "production",
  "rolloutPercentage": 25,
  "projectId": "ecommerce",
  "stickiness": "userId"
}
```

**Tool output**

Returns a confirmation with the configured percentage, a link to the flag in the Unleash Admin UI, the Admin API strategies URL, and an MCP resource link for the flag.

### Get flag state

The `get_flag_state` tool fetches a feature flag's current metadata and environment strategies from the Unleash Admin API. It returns the flag's type, enabled/archived status, impression data setting, and a per-environment summary of active strategies and variants.

#### When to use

Use this tool to inspect a flag before modifying it, to check how many strategies are active across environments, or to find strategy IDs before calling `remove_flag_strategy`.

#### Parameters

- `featureName` (required): Feature flag name.
- `projectId` (optional): Project ID (defaults to `UNLEASH_DEFAULT_PROJECT`).
- `environment` (optional): Filter results to a single environment (case-insensitive).

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

Returns a text summary of the flag (type, enabled/archived/impression-data, project, environment summaries with strategy counts) along with UI and API links. The structured output includes the full feature object with all environments and strategy details.

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

Returns a text summary plus structured content with `projectId`, `archived`, `order`, `limit`, `offset`, `nextOffset`, `totalFlags`, and the `flags` array (each with name, type, project, archived status, and links). Use `nextOffset` to page through large projects.

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

Returns a text summary plus structured content with `order`, `limit`, `offset`, `nextOffset`, `totalProjects`, and the `projects` array (each with id, name, description, mode, creation time, and URL).

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

Returns a confirmation of the new state, a summary of the environment (enabled/disabled, strategy count), and links to the flag in the Unleash Admin UI and Admin API.

### Remove flag strategy

The `remove_flag_strategy` tool deletes a strategy configuration from a feature flag environment. Use `get_flag_state` first to discover the strategy ID.

#### When to use

Use this tool to clean up stale strategies, or to replace an existing strategy by removing the old one and configuring a new one with `set_flag_rollout`.

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

Returns a confirmation of removal, a count of remaining strategies in the environment, and links to the flag in the Unleash Admin UI and Admin API.

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
│   └── client.ts                # Unleash Admin API client
├── tools/
│   ├── types.ts                 # Shared ToolDefinition type
│   ├── createFlag.ts            # create_flag tool
│   ├── evaluateChange.ts        # evaluate_change tool
│   ├── detectFlag.ts            # detect_flag tool
│   ├── wrapChange.ts            # wrap_change tool
│   ├── cleanupFlag.ts           # cleanup_flag tool
│   ├── setFlagRollout.ts        # set_flag_rollout tool
│   ├── getFlagState.ts          # get_flag_state tool
│   ├── toggleFlagEnvironment.ts # toggle_flag_environment tool
│   └── removeFlagStrategy.ts    # remove_flag_strategy tool
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
- `POST /api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies` - Add rollout strategy
- `DELETE /api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies/{strategyId}` - Remove strategy
- `POST /api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on` - Enable flag
- `POST /api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/off` - Disable flag

## Troubleshooting

### Configuration issues

**Error: "UNLEASH_BASE_URL must be a valid URL"**: Ensure your base URL is complete, including protocol. For example, `https://app.unleash-hosted.com/instance`. Remove any trailing slashes.

**Error: "UNLEASH_PAT is required"**: Check that your `.env` file exists and contains `UNLEASH_PAT={{your-personal-access-token}}`. Verify that the token is valid in Unleash.

### API issues

**Error: "HTTP_401"**: Your personal access token may be invalid or expired. Generate a new token under **Profile > View Profile settings > Personal API tokens > New token**.

**Error: "HTTP_403"**: Your token doesn't have permission to create flags in this project. Review your role and permissions in Unleash.

**Error: "HTTP_404"**: The project ID doesn't exist. Confirm the project ID in Unleash Admin UI.

**Error: "HTTP_409"**: A flag with this name already exists in the project. Use a different name or reuse the existing flag.

## License

MIT

## Contributing

This is a purpose-driven project with a focused scope. Contributions should:

- Align with the existing tool surface and MCP resource model.
- Maintain the thin, purpose-driven architecture.
- Follow Unleash best practices.
- Include clear documentation.
