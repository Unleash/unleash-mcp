# Unleash MCP Server

A purpose-driven [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for managing [Unleash](https://www.getunleash.io/) feature flags. This server enables LLM-powered coding assistants to create and manage feature flags following Unleash best practices.

## Overview

This MCP server provides tools that integrate with the Unleash Admin API, allowing AI coding assistants to:

- ✅ **Create feature flags** with proper validation and typing
- 🔍 **Detect existing flags** to prevent duplicates and encourage reuse
- 🧭 **Evaluate changes** to determine if feature flags are needed
- 🔄 **Stream progress** for visibility during operations
- 🛡️ **Handle errors** gracefully with helpful hints
- 🏗️ **Follow best practices** from [Unleash documentation](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale)

### Current Implementation

- `create_flag` tool for creating flags via Admin API
- `evaluate_change` tool for determining when flags are needed
- `detect_flag` tool for discovering existing flags to prevent duplicates
- `wrap_change` tool for instructing the LLM how to wrap the change based on current code base patterns

## Installation

### Claude & Codex
```
claude mcp add unleash \
    --env UNLEASH_BASE_URL=URL \
    --env UNLEASH_PAT=PAT \
    -- npx -y @unleash/mcp@latest --log-level error

codex mcp add unleash \
    --env UNLEASH_BASE_URL=URL \
    --env UNLEASH_PAT=PAT \
    -- npx -y @unleash/mcp@latest --log-level error
```

### Prerequisites

- Node.js 18 or higher
- Yarn package manager
- An Unleash instance (hosted or self-hosted)
- A Personal Access Token (PAT) from Unleash

### Quick start (npx)

You can run the MCP server without cloning the repository by installing it on the fly with `npx`. Provide your configuration as environment variables or via a local `.env` file in the directory where you run the command:

```bash
UNLEASH_BASE_URL=https://app.unleash-hosted.com/your-instance \
UNLEASH_PAT=your-personal-access-token \
UNLEASH_DEFAULT_PROJECT=default \
npx unleash-mcp --log-level debug
```

The CLI supports the same flags as the local build (`--dry-run`, `--log-level`).

### Setup

1. **Clone and install dependencies:**

```bash
yarn install
```

2. **Configure environment variables:**

Copy `.env.example` to `.env` and fill in your Unleash credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
UNLEASH_BASE_URL=https://app.unleash-hosted.com/your-instance
UNLEASH_PAT=your-personal-access-token
UNLEASH_DEFAULT_PROJECT=default  # Optional: set a default project
```

To generate a Personal Access Token:
1. Log into your Unleash instance
2. Go to Profile → Personal Access Tokens
3. Create a new token with permissions to create feature flags

3. **Build the project:**

```bash
yarn build
```

## Usage

### Running the Server

**Development mode (with hot reload):**

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

### Available Capabilities

#### Tool: `create_flag`

Creates a new feature flag in Unleash with comprehensive validation and progress tracking.

**Parameters:**

- `name` (required): Unique feature flag name within the project
  - Use descriptive names like `new-checkout-flow` or `enable-dark-mode`
- `type` (required): Feature flag type indicating lifecycle and intent
  - `release`: Gradual feature rollouts to users
  - `experiment`: A/B tests and experiments
  - `operational`: System behavior and operational toggles
  - `kill-switch`: Emergency shutdowns or circuit breakers
  - `permission`: Role-based access control
- `description` (required): Clear explanation of what the flag controls and why
- `projectId` (optional): Target project (defaults to `UNLEASH_DEFAULT_PROJECT`)
- `impressionData` (optional): Enable analytics tracking (defaults to false)

**Example:**

```json
{
  "name": "new-checkout-flow",
  "type": "release",
  "description": "Gradual rollout of the redesigned checkout experience with improved conversion tracking",
  "projectId": "ecommerce",
  "impressionData": true
}
```

**Response:**

Returns a success message with:
- Feature flag URL in the Unleash Admin UI
- MCP resource link for programmatic access
- Creation timestamp and configuration details

---

#### Tool: `evaluate_change`

Provides comprehensive guidance for evaluating whether code changes require feature flags. This tool returns detailed markdown guidance to help make informed decisions.

**When to use:**
- Starting work on a new feature or change
- Unsure if a feature flag is needed
- Want guidance on rollout strategy
- Need help choosing the right flag type

**Optional Parameters:**

- `repository` (string): Repository name or path
- `branch` (string): Current branch name
- `files` (array): List of files being changed
- `description` (string): Description of the change
- `riskLevel` (enum): User-assessed risk level (low, medium, high, critical)
- `codeContext` (string): Surrounding code for parent flag detection

**What it provides:**

The tool returns guidance covering:

1. **Parent Flag Detection**: Checks if code is already protected by existing flags (avoiding nesting)
2. **Risk Assessment**: Analyzes code patterns to identify risky operations
3. **Code Type Evaluation**: Determines if change is a test, config, feature, bug fix, etc.
4. **Recommendation**: Suggests whether to create a flag, use existing flag, or skip flag
5. **Next Actions**: Provides specific instructions on what to do next

**Evaluation Process:**

```
Step 1: Gather code changes (git diff, read files)
        ↓
Step 2: Check for parent flags (avoid nesting)
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

**Risk Assessment:**

The tool provides language-agnostic patterns to detect:

- 🔴 **Critical Risk** (Score +5): Auth, payments, security, database operations
- 🟠 **High Risk** (Score +3): API changes, external services, new classes
- 🟡 **Medium Risk** (Score +2): Async operations, state management
- 🟢 **Low Risk** (Score +1): Bug fixes, refactors, small changes

**Parent Flag Detection:**

Detects existing flag checks across languages:
- **Conditionals**: `if (isEnabled('flag'))`, `if client.is_enabled('flag'):`
- **Assignments**: `const enabled = useFlag('flag')`
- **Hooks**: `const enabled = useFlag('flag')` → `{enabled && <Component />}`
- **Guards**: `if (!isEnabled('flag')) return;`
- **Wrappers**: `withFeatureFlag('flag', () => {...})`

**Output Format:**

Returns JSON evaluation result:

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

**Best Practices Included:**

The tool includes Unleash best practices:
- Flag type selection criteria
- Rollout sequencing strategies (dev → staging → production)
- Anti-patterns to avoid (flag sprawl, nesting, long-lived flags)
- Cleanup and lifecycle guidance

**Automatic Workflow:**

When `evaluate_change` determines a flag is needed, it provides **explicit instructions** to:

1. Call `create_flag` tool to create the feature flag
2. Call `wrap_change` tool to get language-specific code wrapping guidance
3. Implement the wrapped code following the detected patterns

**Example Usage in Claude Desktop:**

```
// Simple usage - let Claude gather context
Use evaluate_change to help me determine if I need a feature flag

// With explicit context
Use evaluate_change with:
- description: "Add Stripe payment processing"
- riskLevel: "high"
```

The tool will automatically guide you through the complete workflow: evaluate → detect → (create OR use existing) → wrap → implement.

**Tool Parameters (all optional):**

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

---

#### Tool: `detect_flag`

Intelligently discovers existing feature flags in the codebase to prevent duplicates and encourage flag reuse.

**When to use:**
- Before creating a new feature flag
- During code evaluation to check for existing flags
- When you want to prevent duplicate flag creation
- To find flags that might already cover your use case

**Parameters:**

- `description` (required): Description of the change or feature
  - Example: `"payment processing with Stripe"`, `"new checkout flow"`
- `files` (optional): List of files being modified to search in same area
  - Example: `["src/payments/stripe.ts", "src/checkout/flow.ts"]`
- `codeContext` (optional): Code context to analyze for nearby flags
  - Useful when you have surrounding code to check

**Example:**

```json
{
  "description": "payment processing with Stripe",
  "files": ["src/payments/stripe.ts"]
}
```

**What it provides:**

The tool returns comprehensive search instructions for discovering flags through multiple detection strategies:

1. **File-based Detection**: Search in files you're modifying for existing flags
2. **Git History Analysis**: Find recently added flags in commit history
3. **Semantic Name Matching**: Match your description to existing flag names
4. **Code Context Analysis**: Find flags near your modification point

**Detection Process:**

```
Step 1: Execute file-based search (Grep for flag patterns in target files)
        ↓
Step 2: Search git history (recent flag additions)
        ↓
Step 3: Perform semantic matching (description → flag names)
        ↓
Step 4: Analyze code context (if provided)
        ↓
Step 5: Combine scores from all methods
        ↓
Step 6: Return best candidate with confidence score
```

**Confidence Levels:**

The tool returns candidates with confidence scores:

- **High (≥0.7)**: Strong match - strongly recommend reusing this flag
- **Medium (0.4-0.7)**: Possible match - review and decide
- **Low (<0.4)**: Weak match - better to create new flag

**Output Format:**

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

Or if no match found:

```json
{
  "flagFound": false,
  "candidate": null
}
```

**Automatic Integration:**

The `detect_flag` tool is automatically integrated into the `evaluate_change` workflow:
- When evaluate_change runs, it calls detect_flag
- If high-confidence match found: Recommend using existing flag
- If no match: Continue with risk assessment and suggest create_flag

**Example Usage in Claude Desktop:**

```
// Check for existing flags before creating
Use detect_flag with description "payment processing with Stripe"

// Integrated automatically in evaluation
Use evaluate_change - it will automatically search for existing flags
```

---

## Architecture

This server follows a purpose-driven design philosophy:

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

### Design Principles

1. **Thin surface area**: Only the endpoints needed for the three core capabilities
2. **Purpose-driven**: Each module serves a specific, well-defined purpose
3. **Explicit validation**: Zod schemas validate all inputs before API calls
4. **Error normalization**: All errors converted to `{code, message, hint}` format
5. **Progress streaming**: Long-running operations provide visibility
6. **Best practices integration**: Guidance from Unleash docs embedded in tool descriptions

### Configuration

Environment variables:

- `UNLEASH_BASE_URL`: Your Unleash instance URL (required)
- `UNLEASH_PAT`: Personal Access Token (required)
- `UNLEASH_DEFAULT_PROJECT`: Default project ID (optional)
- `UNLEASH_DEFAULT_ENVIRONMENT`: Default environment (reserved for future use)

CLI flags:

- `--dry-run`: Simulate operations without making actual API calls
- `--log-level`: Set logging verbosity (debug, info, warn, error)

## Development

### Type Checking

```bash
yarn lint
```

### Testing

The testing framework (Vitest) is configured but tests are not yet implemented:

```bash
yarn test
```

### Building

```bash
yarn build
```

Output will be in the `dist/` directory.

## Best Practices

---

#### Tool: `wrap_change`

Generates language-specific code snippets and guidance for wrapping code changes with feature flags. This tool helps you implement feature flags correctly by finding existing patterns and matching your codebase's conventions.

**When to use:**
- After creating a feature flag with `create_flag`
- When you need to wrap code with a feature flag
- Want to follow existing codebase patterns
- Need framework-specific examples (React, Django, etc.)

**Parameters:**

- `flagName` (required): Feature flag name to wrap the code with
  - Example: `"new-checkout-flow"`, `"stripe-integration"`
- `language` (optional): Programming language (auto-detected from fileName if not provided)
  - Supported: `typescript`, `javascript`, `python`, `go`, `ruby`, `php`, `csharp`, `java`, `rust`
- `fileName` (optional): File name being modified (helps detect language)
  - Example: `"checkout.ts"`, `"payment.py"`, `"handler.go"`
- `codeContext` (optional): Surrounding code to help detect existing patterns
- `frameworkHint` (optional): Framework for specialized templates
  - Examples: `"React"`, `"Express"`, `"Django"`, `"Rails"`, `"Spring Boot"`

**What it provides:**

1. **Search Instructions**: Step-by-step guide for finding existing flag patterns in your codebase using Grep
2. **Pattern Detection**: Identifies common patterns (imports, client variable names, method names, wrapping styles)
3. **Default Templates**: Fallback code snippets if no patterns are found
4. **Framework-Specific Examples**: Specialized patterns for React, Express, Django, etc.
5. **Multiple Patterns**: If-blocks, guard clauses, hooks, decorators, middleware, etc.

**Supported Languages & Frameworks:**

- **TypeScript/JavaScript**: Node.js, React hooks, Express middleware
- **Python**: FastAPI, Django, Flask decorators
- **Go**: Standard if-blocks, HTTP middleware
- **Ruby**: Rails controllers
- **PHP**: Laravel controllers
- **C#**: .NET/ASP.NET controllers
- **Java**: Spring Boot
- **Rust**: Actix/Rocket handlers

**Example Usage:**

```json
{
  "flagName": "new-checkout-flow",
  "fileName": "checkout.ts",
  "frameworkHint": "React"
}
```

**Response:**

Returns comprehensive guidance including:
- Quick start with recommended pattern
- Search instructions for finding existing patterns
- Wrapping instructions with placeholders
- All available templates for the language
- SDK documentation links

**Workflow:**

```
evaluate_change → create_flag → wrap_change
```

1. `evaluate_change` determines if flag is needed
2. `create_flag` creates the flag in Unleash
3. `wrap_change` generates code to use the flag

**Example Output Structure:**

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

---

## Best Practices

This server encourages Unleash best practices from the [official documentation](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale):

### Flag Lifecycle

1. **Create with intent**: Choose the right flag type to signal purpose
2. **Document clearly**: Write descriptions that explain the "why"
3. **Plan for cleanup**: Feature flags are temporary - plan their removal
4. **Monitor usage**: Enable impression data for important flags

### Flag Types

- **Release flags**: For gradual feature rollouts (remove after full rollout)
- **Experiment flags**: For A/B tests (remove after analysis)
- **Operational flags**: For system behavior (longer-lived, review periodically)
- **Kill switches**: For emergency controls (maintain until feature is stable)
- **Permission flags**: For access control (longer-lived, review permissions)

### Naming Conventions

- Use kebab-case: `new-checkout-flow`
- Be descriptive: `enable-ai-recommendations` not `flag1`
- Include scope when needed: `mobile-push-notifications`

## API Reference

This server uses the Unleash Admin API. For complete API documentation, see:

- [Unleash Admin API OpenAPI Spec](https://app.unleash-hosted.com/hosted/docs/openapi.json)
- [Unleash API Documentation](https://docs.getunleash.io/reference/api/unleash)

### Endpoints Used

- `POST /api/admin/projects/{projectId}/features` - Create feature flag

## Troubleshooting

### Configuration Issues

**Error: "UNLEASH_BASE_URL must be a valid URL"**
- Ensure your base URL is complete, including protocol: `https://app.unleash-hosted.com/instance`
- Remove trailing slashes

**Error: "UNLEASH_PAT is required"**
- Check that your `.env` file exists and contains `UNLEASH_PAT=...`
- Verify the token hasn't expired in Unleash

### API Issues

**Error: "HTTP_401"**
- Your Personal Access Token may be invalid or expired
- Generate a new token from Unleash Profile → Personal Access Tokens

**Error: "HTTP_403"**
- Your token doesn't have permission to create flags in this project
- Check your role permissions in Unleash

**Error: "HTTP_404"**
- The project ID doesn't exist
- Verify the project name in Unleash Admin UI

**Error: "HTTP_409"**
- A flag with this name already exists in the project
- Choose a different name or check existing flags

## License

MIT

## Contributing

This is a purpose-driven project with a focused scope. Contributions should:

1. Align with the three core capabilities (create, evaluate, wrap)
2. Maintain the thin, purpose-driven architecture
3. Follow Unleash best practices
4. Include clear documentation

## Roadmap

### Phase 1: ✅ Feature Flag Creation (Complete)
- [x] `create_flag` tool
- [x] Unleash Admin API client
- [x] Configuration and error handling
- [x] Progress streaming

### Phase 2: ✅ Evaluation Guidance (Complete)
- [x] `evaluate_change` tool
- [x] Risk assessment patterns (language-agnostic)
- [x] Parent flag detection (cross-language)
- [x] Rollout strategy recommendations
- [x] Best practices knowledge base
- [x] Systematic evaluation workflow
- [x] Markdown-formatted guidance output

### Phase 3: ✅ Code Generation (Complete)
- [x] `wrap_change` tool
- [x] Multi-language snippet templates (8 languages)
- [x] Pattern detection guidance (via search instructions)
- [x] Convention awareness (match existing patterns)
- [x] Framework-specific templates (React, Django, Rails, etc.)

## Resources

- [Unleash Documentation](https://docs.getunleash.io/)
- [Feature Flag Best Practices](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Unleash Admin API](https://docs.getunleash.io/reference/api/unleash)
