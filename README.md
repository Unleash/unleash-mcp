# Unleash MCP Server

A purpose-driven [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for managing [Unleash](https://www.getunleash.io/) feature flags. This server enables LLM-powered coding assistants to create and manage feature flags following Unleash best practices.

## Overview

This MCP server provides tools that integrate with the Unleash Admin API, allowing AI coding assistants to:

- ✅ **Create feature flags** with proper validation and typing
- 🔄 **Stream progress** for visibility during operations
- 🛡️ **Handle errors** gracefully with helpful hints
- 🏗️ **Follow best practices** from [Unleash documentation](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale)

### Phase 1: Feature Flag Creation

This initial release focuses on the `create_flag` tool. Future phases will add:

- **evaluate_change** (prompt): Guide LLMs on when to create flags and which rollout strategy to use
- **wrap_change** (tool): Generate language-specific code snippets for flag usage

## Installation

### Prerequisites

- Node.js 18 or higher
- Yarn package manager
- An Unleash instance (hosted or self-hosted)
- A Personal Access Token (PAT) from Unleash

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

### Available Tools

#### `create_flag`

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

## Architecture

This server follows a purpose-driven design philosophy:

### Structure

```
src/
├── index.ts              # Main server entry point
├── config.ts             # Configuration loading and validation
├── context.ts            # Shared runtime context
├── unleash/
│   └── client.ts         # Unleash Admin API client
├── tools/
│   └── createFlag.ts  # create_flag tool
└── utils/
    ├── errors.ts         # Error normalization
    └── streaming.ts      # Progress notifications
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

### Phase 1: ✅ Feature Flag Creation
- [x] `create_flag` tool
- [x] Unleash Admin API client
- [x] Configuration and error handling
- [x] Progress streaming

### Phase 2: Evaluation Guidance (Planned)
- [ ] `evaluate_change` prompt
- [ ] Risk assessment logic
- [ ] Rollout strategy recommendations
- [ ] Best practices integration

### Phase 3: Code Generation (Planned)
- [ ] `wrap_change` tool
- [ ] Multi-language snippet templates
- [ ] Pattern detection from existing code
- [ ] Convention awareness

## Resources

- [Unleash Documentation](https://docs.getunleash.io/)
- [Feature Flag Best Practices](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Unleash Admin API](https://docs.getunleash.io/reference/api/unleash)
