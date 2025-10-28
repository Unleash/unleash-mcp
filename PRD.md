# Product Requirements Document: Unleash MCP Server

## Overview

**Product Name**: Unleash MCP Server
**Version**: 0.1.0 (Phase 1)
**Status**: Phase 1 Complete - Foundation & Flag Creation
**Last Updated**: 2025-10-28

## Vision

Enable LLM-powered coding assistants to act as purpose-driven coding buddies that keep risky changes safely gated behind Unleash feature flags. The MCP server provides a focused surface area for creating, evaluating, and wrapping code changes with feature flags while maintaining Unleash best practices.

## Goals

1. **Simplify feature flag creation** - Reduce ceremony around creating flags via Admin API
2. **Guide best practices** - Surface Unleash recommendations at the right moments
3. **Accelerate adoption** - Generate code snippets that follow existing patterns
4. **Maintain quality** - Validate inputs, normalize errors, stream progress

## Non-Goals

- Generic API explorer for all Unleash endpoints
- Full-featured Unleash UI replacement
- Flag analytics or reporting dashboard
- User management or permissions administration

## Target Users

- **Primary**: LLM coding assistants (Claude, GPT-4, etc.) via MCP protocol
- **Secondary**: Developers using MCP-enabled tools who want programmatic flag management
- **Tertiary**: Teams adopting feature flag workflows who need guided rollout strategies

---

## Phase 1: Completed ✅

### Scope

Build the foundation and implement the `feature_flag.create` tool.

### What Was Delivered

#### 1. Project Infrastructure

- **Package Management**: Yarn-based project with TypeScript
- **Build System**: TypeScript compiler with strict mode, ES2022 target
- **Testing Framework**: Vitest configured (no tests yet)
- **Development Tools**:
  - `yarn dev` - Development mode with tsx
  - `yarn build` - Production build
  - `yarn lint` - Type checking
  - `yarn test` - Test runner

#### 2. Configuration System (`src/config.ts`)

**Features**:
- Environment variable loading via `.env` file
- CLI flag support (`--dry-run`, `--log-level`)
- Zod schema validation with helpful error messages
- Optional default project/environment configuration

**Environment Variables**:
- `UNLEASH_BASE_URL` (required) - Unleash instance URL
- `UNLEASH_PAT` (required) - Personal Access Token
- `UNLEASH_DEFAULT_PROJECT` (optional) - Default project for flag creation
- `UNLEASH_DEFAULT_ENVIRONMENT` (optional) - Reserved for future use

**CLI Flags**:
- `--dry-run` - Simulate operations without API calls
- `--log-level <level>` - Set logging verbosity (debug|info|warn|error)

#### 3. Unleash Admin API Client (`src/unleash/client.ts`)

**Features**:
- Minimal client focused on flag creation endpoint only
- Native `fetch` API (Node 18+) - no external HTTP dependencies
- Dry-run mode support for safe testing
- PAT authentication
- Comprehensive error handling with detailed messages

**Endpoints Implemented**:
- `POST /api/admin/projects/{projectId}/features` - Create feature flag

**Types**:
- `FeatureFlagType`: release | experiment | operational | kill-switch | permission
- `CreateFeatureFlagRequest` - Input payload
- `CreateFeatureFlagResponse` - API response

#### 4. Error Handling (`src/utils/errors.ts`)

**Features**:
- Normalized error format: `{code, message, hint}`
- Zod validation error translation
- HTTP error parsing with status-specific hints
- Custom error class for domain errors

**Error Hints Include**:
- 401: Check PAT token
- 403: Verify permissions
- 404: Check project ID
- 409: Flag name conflict
- 422: Invalid parameters
- 429: Rate limiting
- 5xx: Server errors

#### 5. Streaming Utilities (`src/utils/streaming.ts`)

**Features**:
- Progress notifications via MCP protocol
- Resource link creation for created flags
- Formatted success/error messages
- Dry-run message formatting

#### 6. Shared Context (`src/context.ts`)

**Features**:
- Centralized runtime context for all tools
- Logger with configurable levels
- Helper functions:
  - `ensureProjectId()` - Project ID resolution
  - `handleToolError()` - Consistent error handling
  - `createLogger()` - Level-based logging

#### 7. Feature Flag Create Tool (`src/tools/featureFlagCreate.ts`)

**Input Schema**:
```typescript
{
  projectId?: string,      // Optional if default set
  name: string,            // Required, unique per project
  type: FeatureFlagType,   // Required
  description: string,     // Required
  impressionData?: boolean // Optional, defaults to false
}
```

**Features**:
- Zod input validation
- Progress streaming (0% → 100%)
- Default project ID resolution
- Comprehensive tool description with best practices
- Resource URI generation
- Dry-run support

**Output**:
- Success message with flag URL
- Resource URI for programmatic access
- Error messages with hints for recovery

#### 8. MCP Server (`src/index.ts`)

**Features**:
- MCP SDK integration
- Stdio transport for communication
- Tool registration and routing
- Startup logging and configuration display
- Graceful error handling

#### 9. Documentation

**README.md**:
- Installation and setup instructions
- Environment variable reference
- Usage examples
- CLI flag documentation
- Best practices from Unleash docs
- Troubleshooting guide
- Architecture overview
- Roadmap for future phases

**.env.example**:
- Template with all configuration options
- Helpful comments for each variable
- PAT generation instructions

### Technical Achievements

- ✅ Full TypeScript with strict mode - zero type errors
- ✅ Comprehensive error handling with user-friendly hints
- ✅ Progress streaming for operation visibility
- ✅ Dry-run mode for safe testing
- ✅ Purpose-driven architecture - minimal dependencies
- ✅ Best practices embedded in tool descriptions
- ✅ Clean separation of concerns (config, client, tools, utils)

### Quality Metrics

- **Type Safety**: 100% - All code fully typed, strict mode enabled
- **Build Status**: ✅ Passing - No compilation errors
- **Dependencies**: Minimal - Only @modelcontextprotocol/sdk, zod, dotenv
- **Documentation**: Comprehensive - README, inline comments, JSDoc

---

## Phase 2: Evaluation Guidance (Planned)

### Objective

Guide LLMs on when to create feature flags and what rollout strategy to use.

### Scope

#### 1. `evaluate_change` Prompt

**Purpose**: Analyze code changes and provide authoritative guidance on flag usage.

**Inputs** (Optional JSON):
```typescript
{
  repository?: string,      // Repo context
  branch?: string,          // Current branch
  files?: string[],         // Modified files
  riskLevel?: string,       // User-assessed risk
  impact?: string,          // Expected impact area
  notes?: string           // Additional context
}
```

**Output Guidance Should Include**:
- **Flag Recommendation**: Should a flag be created? (Yes/No/Maybe)
- **Flag Type Suggestion**: Which type best fits this change?
- **Rollout Strategy**: Suggested steps (dev enablement, percentage rollout, etc.)
- **Risk Assessment**: Identified risks and mitigation strategies
- **Next Action**: Which tool to call next (feature_flag.create or wrap_change)
- **Best Practice References**: Links to relevant Unleash documentation

**Tone**: Proactive, authoritative, aligned with Unleash best practices

**Key Features**:
- Pattern matching for common risky changes (DB schema, auth, payments, etc.)
- Rollout sequencing recommendations (dev → staging → production)
- Flag lifecycle guidance (when to remove, how long to keep)
- Ownership recommendations (who should manage this flag)

#### 2. Best Practices Knowledge Base

**File**: `src/docs/unleashBestPractices.ts` or similar

**Content**:
- Condensed guidance from https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale
- Flag lifecycle management
- Cleanup strategies
- Rollout sequencing patterns
- Common anti-patterns to avoid

**Purpose**: Allow prompts/tools to reference best practices without re-fetching

### TODO: Phase 2 Tasks

- [ ] Design `evaluate_change` prompt schema
- [ ] Create best practices knowledge base module
- [ ] Implement risk assessment logic
  - [ ] Pattern matching for risky changes (DB, auth, payments, API contracts)
  - [ ] Risk level scoring (low/medium/high/critical)
  - [ ] Impact area classification
- [ ] Build rollout strategy generator
  - [ ] Environment-based rollout (dev → staging → prod)
  - [ ] Percentage-based rollout strategies
  - [ ] Canary deployment recommendations
- [ ] Write prompt template with guidance
  - [ ] When to create flags (decision tree)
  - [ ] Flag type selection criteria
  - [ ] Next action recommendations
- [ ] Integrate with existing context
  - [ ] Access to best practices knowledge
  - [ ] Link to feature_flag.create tool
  - [ ] Link to wrap_change tool (Phase 3)
- [ ] Add examples to README
- [ ] Write tests for risk assessment logic
- [ ] Document evaluation criteria and decision logic

---

## Phase 3: Code Generation (Planned)

### Objective

Generate language-specific code snippets that wrap changes behind feature flags, following existing project conventions.

### Scope

#### 1. `wrap_change` Tool

**Purpose**: Return code snippets for guarding changes with feature flags.

**Inputs**:
```typescript
{
  flagKey: string,              // Feature flag name/key
  language: string,             // Primary language (typescript, python, java, etc.)
  codeContext?: string,         // Optional: existing code sample
  frameworkHint?: string        // Optional: React, Express, Django, etc.
}
```

**Features**:
- Multi-language snippet templates
- Pattern detection from `codeContext` when provided
- Convention awareness (import style, helper names, wrapping patterns)
- Transparent detection reasoning in response

**Output**:
```typescript
{
  snippets: Array<{
    language: string,
    framework?: string,
    code: string,
    description: string
  }>,
  detectedPatterns?: {
    importStyle: string,
    helperName: string,
    wrappingPattern: string,
    reasoning: string
  },
  explanation: string
}
```

#### 2. Snippet Template Library

**File**: `src/templates/` directory

**Languages to Support**:
- TypeScript/JavaScript (Node, React, Vue, Angular)
- Python (FastAPI, Django, Flask)
- Java (Spring Boot)
- Go (Echo, Gin)
- Ruby (Rails)
- C# (.NET)

**Wrapping Patterns**:
- If/else blocks
- Early returns
- Feature component wrappers (React)
- Middleware guards (Express/FastAPI)
- Decorator patterns

#### 3. Pattern Detection Engine

**Features**:
- Analyze `codeContext` for existing flag usage
- Detect import patterns (named imports, default imports, require)
- Identify helper function names (`isFeatureEnabled`, `useFeatureFlag`, etc.)
- Recognize wrapping styles (if blocks vs. early returns vs. hooks)
- Mirror existing code style (single quotes vs. double quotes, etc.)

**Fallback**:
- Sensible defaults when no context provided
- Community best practices per language/framework

### TODO: Phase 3 Tasks

- [ ] Design snippet template structure
- [ ] Create template library
  - [ ] TypeScript/JavaScript templates
    - [ ] Node.js if/else guard
    - [ ] Node.js early return
    - [ ] React component wrapper
    - [ ] React hook pattern
    - [ ] Express middleware
  - [ ] Python templates
    - [ ] Function decorator
    - [ ] Context manager
    - [ ] FastAPI dependency
    - [ ] Django middleware
  - [ ] Java templates
    - [ ] Spring Boot annotation
    - [ ] If/else guard
  - [ ] Go templates
    - [ ] Middleware pattern
    - [ ] If guard
  - [ ] Ruby templates (Rails)
  - [ ] C# templates (.NET)
- [ ] Implement pattern detection engine
  - [ ] Import style detector
  - [ ] Helper name extractor
  - [ ] Wrapping pattern analyzer
  - [ ] Code style analyzer (quotes, semicolons, etc.)
- [ ] Build template selection logic
  - [ ] Language/framework routing
  - [ ] Pattern-based template selection
  - [ ] Fallback to defaults
- [ ] Integrate with MCP server
  - [ ] Register tool
  - [ ] Add to server index
  - [ ] Connect to context
- [ ] Write comprehensive tests
  - [ ] Template rendering tests
  - [ ] Pattern detection tests
  - [ ] Edge case handling
- [ ] Document usage in README
  - [ ] Add examples for each language
  - [ ] Explain pattern detection
  - [ ] Show customization options
- [ ] Create snippet validation
  - [ ] Syntax checking where possible
  - [ ] Template completeness validation

---

## Cross-Phase Tasks

### Documentation
- [ ] Create `docs/architecture.md` explaining purpose-driven design
- [ ] Create `docs/contributing.md` with contribution guidelines
- [ ] Add inline code comments where logic is complex
- [ ] Create examples directory with sample MCP conversations

### Testing
- [ ] Write unit tests for config loading
- [ ] Write unit tests for error normalization
- [ ] Write unit tests for Unleash client
- [ ] Write integration tests for feature_flag.create
- [ ] Add test coverage reporting
- [ ] Set up CI/CD for automated testing

### Quality & Maintenance
- [ ] Add ESLint configuration
- [ ] Add Prettier for code formatting
- [ ] Set up pre-commit hooks (Husky)
- [ ] Add GitHub Actions for CI
- [ ] Create issue templates
- [ ] Add pull request template
- [ ] Set up semantic versioning
- [ ] Create CHANGELOG.md

### Developer Experience
- [ ] Add debug mode with verbose logging
- [ ] Create sample .env files for different scenarios
- [ ] Add example MCP client configurations
- [ ] Create troubleshooting runbook
- [ ] Add telemetry (optional, opt-in)

### Security & Compliance
- [ ] Security audit of dependencies
- [ ] Add dependency scanning (Dependabot)
- [ ] Document security best practices
- [ ] Add rate limiting considerations
- [ ] Token rotation guidance

---

## Success Metrics

### Phase 1 (Completed ✅)
- [x] Zero TypeScript compilation errors
- [x] Successful build output
- [x] All required configuration options documented
- [x] Error handling covers all common cases
- [x] README provides clear setup instructions

### Phase 2 (Planned)
- [ ] Evaluation prompt provides actionable guidance in >90% of cases
- [ ] Risk assessment matches developer intuition in manual review
- [ ] Rollout recommendations align with Unleash best practices
- [ ] Users can follow prompt guidance to successful flag creation

### Phase 3 (Planned)
- [ ] Generated snippets compile/run without modification in >80% of cases
- [ ] Pattern detection successfully identifies conventions in >70% of cases
- [ ] Support for top 5 programming languages
- [ ] Users can copy-paste snippets directly into their codebase

### Overall
- [ ] LLM assistants can complete full flag workflow without human intervention
- [ ] Average time to create and wrap a flag: <2 minutes
- [ ] Error messages enable self-service recovery
- [ ] Documentation comprehensiveness score: >8/10

---

## Technical Debt & Known Limitations

### Current Limitations

1. **Single Endpoint**: Only supports flag creation, not updates or deletion
2. **No Validation**: Project ID existence not validated before API call
3. **No Tests**: Framework configured but no tests written
4. **No Strategies**: Cannot configure rollout strategies during creation
5. **No Variants**: Cannot create variants during flag creation
6. **No Tags**: Cannot assign tags to flags
7. **Stdio Only**: Only supports stdio transport (no HTTP/SSE)

### Planned Improvements

- **Expand API Coverage** (Post-Phase 3):
  - Update existing flags
  - Delete/archive flags
  - List existing flags
  - Configure strategies and variants

- **Enhanced Validation**:
  - Pre-flight project existence check
  - Flag name availability check
  - Duplicate detection with suggestions

- **Richer Features**:
  - Tag assignment during creation
  - Initial strategy configuration
  - Variant creation
  - Constraint configuration

---

## Dependencies

### Production Dependencies
- `@modelcontextprotocol/sdk` (^1.0.4) - MCP protocol implementation
- `zod` (^3.24.1) - Schema validation
- `dotenv` (^16.4.7) - Environment variable loading

### Development Dependencies
- `typescript` (^5.7.2) - TypeScript compiler
- `@types/node` (^22.10.2) - Node.js type definitions
- `tsx` (^4.19.2) - TypeScript execution
- `vitest` (^2.1.8) - Testing framework

### Dependency Strategy
- Minimize external dependencies
- Use native Node.js APIs where possible (fetch vs axios)
- Keep dependencies updated (Dependabot recommended)
- Audit regularly for security vulnerabilities

---

## Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Unleash API changes break client | Low | High | Pin API version, add integration tests, monitor Unleash changelog |
| MCP protocol changes | Medium | High | Pin SDK version, follow MCP updates, test against new releases |
| PAT token security | Medium | Critical | Document secure storage, support token rotation, never log tokens |
| Rate limiting from Unleash | Low | Medium | Implement backoff, add rate limit handling, document limits |
| Large codebases crash pattern detection | Medium | Low | Add timeout, limit context size, graceful degradation |

### Product Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLMs don't follow guidance | Medium | High | Iterative prompt improvement, clear action items, examples |
| Generated code doesn't match project style | Medium | Medium | Improve pattern detection, provide customization options |
| Users create too many flags (sprawl) | High | Medium | Evaluation prompt warns about reuse, tracks flag rationale |
| Flags not cleaned up after rollout | High | High | Lifecycle reminders in prompts, flag age tracking (future) |

---

## Open Questions

### Phase 2
- Should `evaluate_change` have access to git history to detect risky patterns?
- How should we handle multi-service architectures in rollout recommendations?
- Should we integrate with existing project management tools for flag tracking?

### Phase 3
- How do we handle frameworks/languages we don't have templates for?
- Should we support custom template injection by users?
- How granular should pattern detection be (file-level vs. project-level)?

### General
- Should we add telemetry to understand usage patterns? (Privacy concerns)
- Do we need a local cache for created flags to prevent duplicates?
- Should we support other MCP transports (HTTP, SSE) beyond stdio?

---

## References

- [Unleash Documentation](https://docs.getunleash.io/)
- [Unleash Best Practices](https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale)
- [Unleash Admin API](https://docs.getunleash.io/reference/api/unleash)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [OpenAPI Specification](https://app.unleash-hosted.com/hosted/docs/openapi.json)

---

## Version History

- **v0.1.0** (2025-10-28) - Phase 1 complete: Foundation and feature_flag.create tool
