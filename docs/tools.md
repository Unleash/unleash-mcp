<!--
  GENERATED FILE — DO NOT EDIT BY HAND.
  Run `pnpm docs:generate` to regenerate from the tool definitions in src/tools.
  CI runs `pnpm docs:check` to fail the build when this file is out of sync.
-->

# Tool reference

This reference is generated from the tool definitions in `src/tools`: each tool's title, MCP behavior annotations, and Zod input schema (via Zod 4's `z.toJSONSchema`), so it stays in sync with what the MCP server registers. Access is derived from the annotations: read-only tools declare `readOnlyHint`, and destructive writes declare `destructiveHint`. For MCP resources, see the README.

The server registers 11 tools:

| Tool | Title | Access |
| --- | --- | --- |
| [`create_flag`](#create_flag) | Create feature flag | write |
| [`evaluate_change`](#evaluate_change) | Evaluate change for flag risk | read-only |
| [`detect_flag`](#detect_flag) | Detect existing flag | read-only |
| [`wrap_change`](#wrap_change) | Wrap change behind a flag | read-only |
| [`cleanup_flag`](#cleanup_flag) | Clean up flag | read-only |
| [`set_flag_rollout`](#set_flag_rollout) | Set flag rollout strategy | write |
| [`get_flag_state`](#get_flag_state) | Get flag state | read-only |
| [`list_flags`](#list_flags) | List feature flags | read-only |
| [`list_projects`](#list_projects) | List Unleash projects | read-only |
| [`toggle_flag_environment`](#toggle_flag_environment) | Toggle flag in environment | write |
| [`remove_flag_strategy`](#remove_flag_strategy) | Remove flag strategy | destructive write |

## `create_flag`

**Create feature flag** (write)

Create a new feature flag in Unleash.

This tool creates a feature flag with the specified configuration. Choose the appropriate flag type:
- release: For gradual feature rollouts to users
- experiment: For A/B tests and experiments
- operational: For system behavior and operational toggles
- kill-switch: For emergency shutdowns or circuit breakers
- permission: For role-based access control

Best practices:
1. Use clear, descriptive names (e.g., "new-checkout-flow" not "flag1")
2. Write comprehensive descriptions explaining the flag's purpose
3. Choose the right type to signal intent and lifecycle
4. Plan for flag removal after successful rollout

See: https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `projectId` | string | optional | Project ID where the flag will be created (optional if UNLEASH_DEFAULT_PROJECT is set) |
| `name` | string | required | Feature flag name (must be unique within the project). Use descriptive names like "new-checkout-flow" |
| `type` | `release` \| `experiment` \| `operational` \| `kill-switch` \| `permission` | required | Feature flag type - determines the lifecycle and usage pattern |
| `description` | string | required | Clear description of what this flag controls, why it exists, and when it should be removed |
| `impressionData` | boolean | optional | Enable impression data collection for analytics (optional, defaults to false) |

## `evaluate_change`

**Evaluate change for flag risk** (read-only)

Provides comprehensive guidance for evaluating whether code changes require feature flags.

This tool returns detailed evaluation guidelines including:
- Workflow for systematic evaluation
- Parent flag detection patterns (avoid nesting)
- Risk assessment criteria
- Code type evaluation (test, config, feature, etc.)
- Decision tree logic
- Best practices from Unleash documentation
- **MANDATORY next action instructions**: Explicit tool call sequence (create_flag → wrap_change → implement)

Use this tool when:
- Starting work on a new feature or change
- Unsure if a feature flag is needed
- Want guidance on rollout strategy
- Need help choosing flag type

IMPORTANT WORKFLOW:
When this tool determines a flag is needed, it provides explicit instructions to:
1. Call 'create_flag' tool to create the feature flag in Unleash
2. Call 'wrap_change' tool to get code wrapping guidance
3. Implement the wrapped code following the patterns

The tool returns markdown-formatted guidance that helps you make informed decisions and take the correct next actions.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `repository` | string | optional | Repository name or path (optional) |
| `branch` | string | optional | Current branch name (optional) |
| `files` | string[] | optional | List of files changed (optional) |
| `description` | string | optional | Description of the change (optional) |
| `riskLevel` | `low` \| `medium` \| `high` \| `critical` | optional | User-assessed risk level (optional) |
| `codeContext` | string | optional | Surrounding code context for parent flag detection (optional) |

## `detect_flag`

**Detect existing flag** (read-only)

Discover existing feature flags in the codebase to prevent duplicates and encourage reuse.

This tool provides comprehensive search instructions for finding existing flags through multiple detection strategies:
- File-based detection: Search in files being modified
- Git history analysis: Find recently added flags
- Semantic name matching: Match description to flag names
- Code context analysis: Find flags near modification point

Use this tool when:
- About to create a new feature flag
- Evaluating whether a flag is needed
- Want to check if similar functionality is already flagged

The tool returns detailed search instructions that guide you through:
1. Executing searches using Bash and Grep tools
2. Scoring candidates from multiple detection methods
3. Combining results to find the best match
4. Returning a confidence-scored recommendation

**Workflow Integration**:
This tool is automatically called by 'evaluate_change' before recommending 'create_flag'.
You can also call it directly when you want to search for existing flags.

**Output**:
Returns markdown guidance with:
- Step-by-step search instructions for each detection method
- Scoring criteria and weight calculations
- Expected JSON response format
- Confidence level interpretation

After following the instructions and finding results, you should return a JSON object
indicating whether a flag was found and, if so, its details with a confidence score.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `description` | string | required | Description of the change or feature you want to find flags for (e.g., "payment processing with Stripe") |
| `files` | string[] | optional | Optional: List of files being modified to search for flags in the same area |
| `codeContext` | string | optional | Optional: Code context around the modification point to analyze for nearby flags |

## `wrap_change`

**Wrap change behind a flag** (read-only)

Generate code snippets and guidance for wrapping changes with feature flags.

⚠️ CRITICAL: This tool enforces RUNTIME-CONTROLLABLE feature flags. You MUST place flag checks INSIDE execution paths (handlers, functions), NOT wrapping route registrations, middleware mounting, or controller registration.

This tool provides language-specific templates and instructions for protecting code changes with feature flags. It helps you:
- Find existing feature flag patterns in your codebase
- Match detected conventions (imports, method names, wrapping styles)
- Generate appropriate code snippets for your language/framework
- Follow Unleash SDK best practices
- Ensure flags are runtime controllable (toggle without redeploy)

Supported languages:
- TypeScript/JavaScript (Node, React, Vue, Angular)
- Python (FastAPI, Django, Flask)
- Go
- Ruby (Rails)
- PHP
- C# (.NET)
- Java (Spring Boot)
- Rust

The tool uses a prompt-based approach: it provides detailed instructions for searching your codebase for existing patterns and matching their conventions. If no patterns are found, it provides sensible defaults based on Unleash SDK documentation.

Usage:
1. Call this tool with the flag name after creating a flag
2. Follow the search instructions to find existing patterns
3. Use the recommended template or match detected patterns
4. Test your implementation

Best suited for use after evaluate_change recommends a flag and create_flag creates it.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `flagName` | string | required | Feature flag name to wrap the code with (e.g., "new-checkout-flow") |
| `language` | string | optional | Programming language (optional, auto-detected from fileName). Supported: typescript, javascript, python, go, ruby, php, csharp, java, rust |
| `fileName` | string | optional | File name being modified (helps detect language, e.g., "checkout.ts") |
| `codeContext` | string | optional | Optional: surrounding code to help detect existing patterns |
| `frameworkHint` | string | optional | Optional: framework hint for specialized templates (React, Express, Django, Rails, etc.) |

## `cleanup_flag`

**Clean up flag** (read-only)

Remove a feature flag from the codebase while preserving the desired code path.

This tool provides comprehensive step-by-step instructions for safely removing feature flag code.
It guides you through:
- Finding all flag occurrences using Grep
- Identifying different flag usage patterns (if-else, ternary, guards, etc.)
- Removing flag checks while preserving the correct code path
- Cleaning up unused imports and dead code
- Verifying and testing the changes

**When to use this tool**:
- After a feature flag has been rolled out to 100% and is no longer needed
- When deprecating an experimental feature (preserve disabled path)
- When cleaning up technical debt from old flags
- After a kill switch is no longer necessary

**Preserve Path Options**:
- "enabled": Keep code that runs when flag is true (most common for successful feature rollouts)
- "disabled": Keep code that runs when flag is false (for removed experiments or kill switches)
- If not provided: You will be instructed to ask the user which path to preserve

**Workflow**:
1. Call this tool with the flag name (optionally specify which path to preserve)
2. If preservePath not provided, you'll be instructed to ask the user via AskUserQuestion tool
3. Follow the returned instructions to search and remove flag code
4. Clean up imports and test the changes
5. Report summary of changes

**Safety Features**:
- Comprehensive pattern identification (handles if-else, ternary, guards, etc.)
- Language-agnostic guidance
- Post-cleanup verification steps
- Test execution reminders
- Import cleanup guidance

This tool is inspired by the Unleash AI flag cleanup workflow used in production.
See: https://github.com/Unleash/unleash/blob/main/.github/workflows/ai-flag-cleanup-pr.yml

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `flagName` | string | required | Name of the feature flag to remove (e.g., "new-checkout-flow") |
| `preservePath` | `enabled` \| `disabled` | optional | Optional: Which code path to preserve: "enabled" = keep code that runs when flag is true (typical for rollouts), "disabled" = keep code that runs when flag is false (for removed features). If not provided, you will be instructed to ask the user. |
| `files` | string[] | optional | Optional: Specific files to clean up. If not provided, searches entire codebase. Useful for partial cleanup or when you already know which files contain the flag. |
| `language` | string | optional | Optional: Programming language for specialized guidance (e.g., "typescript", "python", "go"). Auto-detected from files if not provided. |

## `set_flag_rollout`

**Set flag rollout strategy** (write)

Configure or update a flexibleRollout strategy for a feature flag environment with an optional rollout percentage and variants. This does NOT enable the feature; call toggle_flag_environment to turn environments on or off.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `projectId` | string | optional | Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set) |
| `featureName` | string | required | Feature flag name |
| `environment` | string | required | Target environment |
| `rolloutPercentage` | number (0–100) | required | Rollout percentage (0-100) |
| `groupId` | string | optional | Group ID for stickiness bucketing (defaults to the feature name) |
| `stickiness` | string | optional | Stickiness field (defaults to "default") |
| `title` | string | optional | Optional descriptive title for the strategy |
| `disabled` | boolean | optional | Disable the strategy (defaults to false) |
| `variants` | object[] | optional | Optional list of strategy-level variants |
| `variants[].name` | string | required | Variant name (unique within this feature) |
| `variants[].weight` | integer (0–1000) | required | Variant weight (0-1000) |
| `variants[].weightType` | `variable` \| `fix` | optional | Variant weight type |
| `variants[].stickiness` | string | optional | Stickiness to use for this variant (defaults to "default") |
| `variants[].payload` | object | optional |  |
| `variants[].payload.type` | `json` \| `csv` \| `string` \| `number` | required | Payload type |
| `variants[].payload.value` | string | required | Serialized payload value |

## `get_flag_state`

**Get flag state** (read-only)

Fetch the current feature flag metadata and environment strategies from the Unleash Admin API.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `projectId` | string | optional | Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set) |
| `featureName` | string | required | Feature flag name |
| `environment` | string | optional | Optional environment filter (case-insensitive) |

## `list_flags`

**List feature flags** (read-only)

List feature flags in an Unleash project, with optional pagination and sort order. By default returns active flags only; set archived=true to list archived flags instead (active and archived flags are disjoint result sets in Unleash and cannot be combined in one response). Use this to discover flags before creating new ones, audit flag inventory for cleanup (call twice — once for active, once for archived), or scope a workflow to a specific project. Returns name, type, description, archived status, and URL for each flag.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `projectId` | string | optional | Project ID to list flags from (optional if UNLEASH_DEFAULT_PROJECT is set; auto-resolved when a single project exists) |
| `archived` | boolean | optional | Set to true to list archived flags instead of active ones. Defaults to false (active flags only). Active and archived flags cannot be returned in the same response — call this tool twice (once with archived=false, once with archived=true) to assemble a full inventory for audit workflows. |
| `limit` | integer (> 0) | optional | Maximum number of flags to return per page (default: server page size, typically 50) |
| `order` | `asc` \| `desc` | optional | Sort order by flag name (default: asc) |
| `offset` | integer (≥ 0) | optional | Number of flags to skip for pagination (default: 0) |

## `list_projects`

**List Unleash projects** (read-only)

List Unleash projects available to the configured token, with optional pagination. Use this for discovery before scoping flag operations to a specific project. Returns project id, name, description, mode, creation time, and URL.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | integer (> 0) | optional | Maximum number of projects to return per page (default: server page size, typically 20) |
| `order` | `asc` \| `desc` | optional | Sort order by project creation time (default: desc, newest first) |
| `offset` | integer (≥ 0) | optional | Number of projects to skip for pagination (default: 0) |

## `toggle_flag_environment`

**Toggle flag in environment** (write)

Enable or disable a feature flag in a specific environment using the Unleash Admin API. For gradual rollouts, configure a flexibleRollout strategy first via set_flag_rollout.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `projectId` | string | optional | Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set) |
| `featureName` | string | required | Feature flag name |
| `environment` | string | required | Environment to toggle |
| `enabled` | boolean | required | Set to true to enable the flag, or false to disable it |

## `remove_flag_strategy`

**Remove flag strategy** (destructive write)

Delete a strategy configuration from a feature flag environment. Use get_flag_state to discover strategy IDs before removal.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `projectId` | string | optional | Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set) |
| `featureName` | string | required | Feature flag name |
| `environment` | string | required | Environment from which to remove the strategy |
| `strategyId` | string | required | ID of the strategy to remove |
