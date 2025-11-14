# Unleash MCP Server

A purpose-driven [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for managing [Unleash](https://www.getunleash.io/) feature flags. This server enables LLM-powered coding assistants to create and manage feature flags following Unleash best practices.

> **Experimental feature**
>
> The Unleash MCP server is an experimental feature. Functionality may change, and we do not yet recommend using it in production environments.
>
> To share feedback, join our [community Slack](https://www.getunleash.io/unleash-community), open an [issue on GitHub](https://github.com/Unleash/unleash-mcp/issues), or email us at
> **beta@getunleash.io**.

## Overview

This MCP server provides tools that integrate with the [Unleash Admin API](https://docs.getunleash.io/understanding-unleash/unleash-overview#admin-api), allowing AI coding assistants to:

- **Create feature flags** with proper validation and typing.
- **Detect existing flags** to prevent duplicates or encourage reuse.
- **Evaluate changes** to decide when a feature flag is needed.
- **Stream progress** for visibility during operations.
- **Handle errors** gracefully with helpful hints.
- **Follow best practices** from the [Unleash documentation](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale).

## Tools overview

The MCP server exposes the following tools:

- `create_flag`: Creates flags via the Admin API.
- `evaluate_change`: Scores risk and recommends feature flag usage.
- `detect_flag`: Discovers existing flags to avoid duplicates.
- `wrap_change`: Guides the LLM on how to guard code paths.
- `set_flag_rollout`: Configures rollout strategies (does not enable environments).
- `get_flag_state`: Surfaces feature metadata and environment strategies.
- `toggle_flag_environment`: Enables or disables environments on demand.
- `remove_flag_strategy`: Deletes strategies from an environment.
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
- Node.js 18 or higher
- Yarn package manager
- An Unleash instance (hosted or self-hosted)
- A [personal access token](https://docs.getunleash.io/reference/api-tokens-and-client-keys#personal-access-tokens) with permissions to create feature flags

## Get started

This section covers the different ways to install and run the Unleash MCP server. You can either follow a setup for [agents](#agent-setup) (such as Claude Desktop and Codex), run the MCP as a [standalone process](#quickstart-with-npx) using npx, or use a [local development](#local-development-setup) setup.

### Agent setup

To add the server directly to Claude Desktop or Codex, run the following command in your terminal:

For Claude Desktop:
```
claude mcp add unleash \
    --env UNLEASH_BASE_URL=https://app.unleash-hosted.com/{{your-instance}} \
    --env UNLEASH_PAT={{your-personal-access-token}} \
    -- npx -y @unleash/mcp@latest --log-level error
```

For Codex:
```
codex mcp add unleash \
    --env UNLEASH_BASE_URL=https://app.unleash-hosted.com/{{your-instance}} \
    --env UNLEASH_PAT={{your-personal-access-token}} \
    -- npx -y @unleash/mcp@latest --log-level error
```

### Quickstart with npx

You can run the MCP server as a standalone process without cloning the repository using `npx`. Provide configuration through environment variables or a local `.env` file in the directory where you run the command:

```bash
UNLEASH_BASE_URL=https://app.unleash-hosted.com/{{your-instance}} \
UNLEASH_PAT={{your-personal-access-token}} \
UNLEASH_DEFAULT_PROJECT={{default_project_id}} \
npx unleash-mcp --log-level debug
```

The CLI supports the same flags as the local build (for example, `--dry-run`, `--log-level`).

### Local development setup

Follow these steps to set up the project for local development.

1. **Install dependencies:**

Clone the repository and install dependencies using Yarn.

```bash
git clone https://github.com/Unleash/unleash-mcp.git
cd unleash-mcp
yarn install
```

2. **Configure environment variables:**

Copy `.env.example` to `.env` and fill in your Unleash credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
UNLEASH_BASE_URL=https://app.unleash-hosted.com/{{your-instance}}
UNLEASH_PAT={{your-personal-access-token}}
UNLEASH_DEFAULT_PROJECT={{default_project_id}}  # Optional: the project the MCP should use by default
```

3. **Build the project:**

```bash
yarn build
```

Output will be in the `dist/` directory.

4. **(Optional) Run checks:**

Run type checking, linting, and tests:

```
# Type checking and linting
yarn lint

# Run tests (the Vitest framework is configured, but no test suites yet)
yarn test
```

### Running the server

**Development mode with hot reload:**

```bash
yarn dev
```

**Production mode:**

```bash
node dist/index.js
```

**With CLI flags:**

```bash
# Dry run mode (simulates API calls without actually creating flags)
node dist/index.js --dry-run

# Custom log level
node dist/index.js --log-level debug

# Combine flags
node dist/index.js --dry-run --log-level debug
```

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

**Agent prompt**:

```
Use create_flag with:
- name: "new-checkout-flow"
- type: "release"
- description: "Gradual rollout of the redesigned checkout experience"
- projectId: "ecommerce"
```

**Tool payload**:
```json
{
  "name": "new-checkout-flow",
  "type": "release",
  "description": "Gradual rollout of the redesigned checkout experience with improved conversion tracking",
  "projectId": "ecommerce",
  "impressionData": true
}
```

**Tool output**:
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

**Agent prompt**:

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

**Tool payload**:
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

**Tool output**:

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

**Confidence levels:**

The tool returns candidates with confidence scores:

- **High (≥0.7)**: Strong match; reuse is recommended.
- **Medium (0.4-0.7)**: Possible match; review manually.
- **Low (<0.4)**: Weak match; likely create a new flag.

#### Parameters

- `description` (required): Description of the change or feature. For example, `"payment processing with Stripe"`, `"new checkout flow"`.
- `files` (optional): Files being modified. For example, `["src/payments/stripe.ts", "src/checkout/flow.ts"]`.
- `codeContext` (optional): Nearby code to scan for flags.

#### Usage example

**Agent prompt**:

Check for existing flags before creating a flag:
```
Use detect_flag with description "payment processing with Stripe"
```

Integrated automatically in evaluation:
```
Use evaluate_change - automatically searches for existing flags
```

**Tool payload**:
```json
{
  "description": "payment processing with Stripe",
  "files": ["src/payments/stripe.ts"]
}
```

**Tool output**:

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

**Agent prompt:**

```
Use wrap_change with:
- flagName: "new-checkout-flow"
- fileName: "src/components/checkout.ts"
- frameworkHint: "React"
```

**Tool payload:**
```json
{
  "flagName": "new-checkout-flow",
  "fileName": "checkout.ts",
  "frameworkHint": "React"
}
```

**Tool output:**

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

## Architecture

The server follows a focused, purpose-driven design.

### Structure

```
src/
├── index.ts                     # Main server entry point
├── config.ts                    # Configuration loading and validation
├── context.ts                   # Shared runtime context
├── unleash/
│   └── client.ts                # Unleash Admin API client
├── tools/
│   ├── createFlag.ts            # create_flag tool
│   ├── evaluateChange.ts        # evaluate_change tool
│   ├── detectFlag.ts            # detect_flag tool
│   └── wrapChange.ts            # wrap_change tool
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
│   └── searchGuidance.ts        # Pattern search instructions
└── utils/
    ├── errors.ts                # Error normalization
    └── streaming.ts             # Progress notifications
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
- `UNLEASH_BASE_URL`: Your Unleash instance URL (required).
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

- `POST /api/admin/projects/{projectId}/features` - Create feature flag

## Troubleshooting

### Configuration issues

**Error: "UNLEASH_BASE_URL must be a valid URL"**: Ensure your base URL is complete, including protocol: `https://app.unleash-hosted.com/instance`. Remove any trailing slashes.

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

- Align with the three core capabilities (create, evaluate, wrap).
- Maintain the thin, purpose-driven architecture.
- Follow Unleash best practices.
- Include clear documentation.

## Resources

- [Unleash Documentation](https://docs.getunleash.io/)
- [Feature Flag Best Practices](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Unleash Admin API](https://docs.getunleash.io/reference/api/unleash)
