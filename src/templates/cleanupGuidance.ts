/**
 * Cleanup Guidance Generator
 *
 * Generates comprehensive instructions for LLMs to safely remove feature flag
 * code while preserving the desired code path (enabled or disabled).
 */

import { SupportedLanguage, getLanguageMetadata } from './languages.js';

/**
 * Preserve path option - which code path to keep
 */
export type PreservePath = 'enabled' | 'disabled';

/**
 * Generate comprehensive cleanup instructions
 */
export function generateCleanupInstructions(
  flagName: string,
  preservePath: PreservePath,
  files?: string[]
): string {
  const searchScope = files && files.length > 0
    ? `specific files: ${files.join(', ')}`
    : 'the entire codebase';

  return `# Feature Flag Cleanup Instructions: "${flagName}"

## ⚠️ IMPORTANT: Safety First

Before you begin:
1. **Backup**: Ensure the current code is committed or backed up
2. **Tests**: Make sure tests exist and pass before cleanup
3. **Understanding**: You will preserve the **${preservePath.toUpperCase()} path** (remove the ${preservePath === 'enabled' ? 'disabled' : 'enabled'} path)

---

## Overview

You are removing the feature flag "${flagName}" from ${searchScope}.

**Goal**: Remove all flag checks while preserving only the **${preservePath}** code path.

**What this means**:
${preservePath === 'enabled'
  ? '- Keep code that runs when the flag is ENABLED/TRUE\n- Remove code that runs when the flag is DISABLED/FALSE'
  : '- Keep code that runs when the flag is DISABLED/FALSE\n- Remove code that runs when the flag is ENABLED/TRUE'
}

---

${generateSearchInstructions(flagName, files)}

---

${generatePatternIdentificationInstructions(preservePath)}

---

${generateCleanupStrategies(preservePath)}

---

${generatePostCleanupChecklist()}

---

## Common Pitfalls to Avoid

1. **Don't leave dead code**: Remove the flag check AND the unwanted path completely
2. **Don't break indentation**: Maintain proper indentation after removing blocks
3. **Don't forget imports**: Remove unused flag-related imports
4. **Don't miss context providers**: Remove flag initialization code if no longer needed
5. **Don't skip tests**: Update or remove tests that specifically test the removed path

---

## Expected Outcome

After cleanup, the code should:
- ✅ Run as if the flag is always **${preservePath}**
- ✅ Have no references to "${flagName}"
- ✅ Be clean, readable, and properly indented
- ✅ Pass all existing tests (with test updates as needed)
- ✅ Have no unused imports or dead code

---

## Reporting Results

After completing the cleanup, provide:
1. **Summary**: Number of files modified and total occurrences removed
2. **Changes by file**: List each file with a brief description of what was removed
3. **Potential issues**: Flag any complex cases that need manual review
4. **Test status**: Whether tests pass after cleanup
`;
}

/**
 * Generate search instructions for finding flag occurrences
 */
function generateSearchInstructions(flagName: string, files?: string[]): string {
  const fileScope = files && files.length > 0
    ? `\n**Files to search**: ${files.map(f => `\`${f}\``).join(', ')}`
    : '';

  return `## Step 1: Find All Flag Occurrences
${fileScope}

Use the **Grep** tool to find all references to the flag:

\`\`\`bash
Grep pattern: "${flagName}" output_mode: "content" -n: true -C: 3
\`\`\`

This will show:
- All lines containing the flag name
- 3 lines of context before and after (to understand the pattern)
- Line numbers for precise editing

**What to look for**:
- Direct flag checks: \`isEnabled('${flagName}')\`, \`is_enabled("${flagName}")\`
- Variable assignments: \`const enabled = isEnabled('${flagName}')\`
- Comments mentioning the flag
- Test cases for the flag
- Configuration or initialization code

**Action**: Create a list of all files and line numbers where "${flagName}" appears.
`;
}

/**
 * Generate pattern identification instructions
 */
function generatePatternIdentificationInstructions(preservePath: PreservePath): string {
  return `## Step 2: Identify Usage Patterns

For each occurrence, identify what pattern is being used:

### Pattern A: If-Else Block
\`\`\`
if (isEnabled('flag')) {
  // Code A
} else {
  // Code B
}
\`\`\`
**Action**: Remove the if-else, keep ${preservePath === 'enabled' ? 'Code A' : 'Code B'}.

---

### Pattern B: Guard Clause
\`\`\`
if (!isEnabled('flag')) {
  return earlyExit;
}
// Main code here
\`\`\`
**Action**: ${preservePath === 'enabled'
  ? 'Remove the guard clause (keep main code)'
  : 'Keep the early exit, remove everything after'}.

---

### Pattern C: Ternary Operator
\`\`\`
const value = isEnabled('flag') ? valueA : valueB;
\`\`\`
**Action**: Replace with ${preservePath === 'enabled' ? '`const value = valueA;`' : '`const value = valueB;`'}

---

### Pattern D: Logical AND/OR
\`\`\`
isEnabled('flag') && doSomething();
isEnabled('flag') || doFallback();
\`\`\`
**Action**: ${preservePath === 'enabled'
  ? 'Replace `&&` with just the function call, remove `||` entirely'
  : 'Remove `&&` statement entirely, replace `||` with just the function call'}.

---

### Pattern E: Component Rendering (React/JSX)
\`\`\`
{isEnabled('flag') && <Component />}
{isEnabled('flag') ? <ComponentA /> : <ComponentB />}
\`\`\`
**Action**: ${preservePath === 'enabled'
  ? 'Keep ComponentA/Component, remove the condition'
  : 'Keep ComponentB or remove the entire block'}.

---

### Pattern F: Variable Assignment
\`\`\`
const isFlagEnabled = isEnabled('flag');
if (isFlagEnabled) { ... }
\`\`\`
**Action**: Remove the variable assignment, then handle the if statement as Pattern A.

---

### Pattern G: Nested Conditions
\`\`\`
if (someCondition) {
  if (isEnabled('flag')) {
    // Nested code
  }
}
\`\`\`
**Action**: ${preservePath === 'enabled'
  ? 'Remove inner flag check, keep nested code within outer condition'
  : 'Remove the entire inner block'}.

---

**Important**: Use the **Read** tool to get full file context for complex patterns.
`;
}

/**
 * Generate cleanup strategies
 */
function generateCleanupStrategies(preservePath: PreservePath): string {
  return `## Step 3: Execute Cleanup

For each file containing the flag:

### 3.1 Read the Full File
\`\`\`bash
Read file_path: "/path/to/file"
\`\`\`

### 3.2 Plan Your Edits
- Identify all flag occurrences in the file
- Note which pattern each one uses
- Determine what code to keep vs remove
- Check for any imports that will become unused

### 3.3 Perform the Edits
Use the **Edit** tool to make changes. Work from bottom to top of the file to preserve line numbers.

**Example cleanup (preserving ${preservePath} path)**:

${generateLanguageSpecificCleanupExamples(preservePath)}

### 3.4 Clean Up Imports
After removing flag checks, look for unused imports:

**Common imports to remove if no longer used**:
- TypeScript/JavaScript: \`import { useFlag } from '...'\`
- Python: \`from unleash.client import UnleashClient\`
- Go: \`import "github.com/Unleash/unleash-client-go/v3"\`
- Ruby: \`require 'unleash'\`
- Java: \`import io.getunleash.Unleash;\`

**Action**: Use **Edit** tool to remove unused imports from each file.

### 3.5 Clean Up Initialization Code (if applicable)
If no flags remain in the file/project, consider removing:
- Unleash client initialization
- Flag context providers
- Flag-related configuration

**Only do this if you're certain no other flags exist in the codebase!**
`;
}

/**
 * Generate language-specific cleanup examples
 */
function generateLanguageSpecificCleanupExamples(preservePath: PreservePath): string {
  if (preservePath === 'enabled') {
    return `**Before (TypeScript)**:
\`\`\`typescript
if (unleash.isEnabled('new-feature')) {
  return newImplementation();
} else {
  return oldImplementation();
}
\`\`\`

**After**:
\`\`\`typescript
return newImplementation();
\`\`\`

---

**Before (Python)**:
\`\`\`python
if unleash_client.is_enabled("new_feature"):
    return new_implementation()
else:
    return old_implementation()
\`\`\`

**After**:
\`\`\`python
return new_implementation()
\`\`\`

---

**Before (React/JSX)**:
\`\`\`typescript
{isEnabled('new-ui') ? <NewUI /> : <OldUI />}
\`\`\`

**After**:
\`\`\`typescript
<NewUI />
\`\`\``;
  } else {
    return `**Before (TypeScript)**:
\`\`\`typescript
if (unleash.isEnabled('experimental-feature')) {
  return experimentalImplementation();
} else {
  return stableImplementation();
}
\`\`\`

**After**:
\`\`\`typescript
return stableImplementation();
\`\`\`

---

**Before (Python)**:
\`\`\`python
if unleash_client.is_enabled("experimental_feature"):
    return experimental_implementation()
else:
    return stable_implementation()
\`\`\`

**After**:
\`\`\`python
return stable_implementation()
\`\`\`

---

**Before (React/JSX)**:
\`\`\`typescript
{isEnabled('beta-feature') && <BetaFeature />}
\`\`\`

**After**:
\`\`\`typescript
{/* BetaFeature removed - flag disabled */}
\`\`\``;
  }
}

/**
 * Generate post-cleanup checklist
 */
function generatePostCleanupChecklist(): string {
  return `## Step 4: Verify and Test

After cleanup, perform these checks:

### 4.1 Verify No References Remain
Run another search to ensure the flag is completely removed:
\`\`\`bash
Grep pattern: "flag-name" output_mode: "files_with_matches"
\`\`\`

**Expected result**: No files should be returned (or only documentation/changelog).

### 4.2 Check Syntax
Ensure the code compiles/parses:
- TypeScript/JavaScript: Run build or type check
- Python: Check for syntax errors
- Other languages: Run language-specific linter/compiler

### 4.3 Run Tests
\`\`\`bash
# Run your test suite
npm test
# or pytest, go test, etc.
\`\`\`

**If tests fail**:
- Update tests that specifically tested the removed code path
- Remove tests that only make sense with the flag
- Fix any logic errors introduced during cleanup

### 4.4 Review Complex Cases
For any complex patterns (deeply nested, multiple conditions), do a manual review:
- Read the cleaned code
- Ensure logic is correct
- Check that error handling is preserved
- Verify edge cases are still handled
`;
}

/**
 * Generate language-specific import removal guidance
 */
export function generateImportCleanupGuidance(language: SupportedLanguage): string {
  const metadata = getLanguageMetadata(language);

  const examples: Record<SupportedLanguage, string> = {
    typescript: `- \`import { useFlag } from '@unleash/proxy-client-react'\`
- \`import { UnleashClient } from 'unleash-client'\`
- \`import unleash from './unleash'\``,
    javascript: `- \`const { UnleashClient } = require('unleash-client');\`
- \`import unleash from './unleash';\``,
    python: `- \`from unleash.client import UnleashClient\`
- \`import unleash\``,
    go: `- \`import "github.com/Unleash/unleash-client-go/v3"\`
- \`import unleash "github.com/Unleash/unleash-client-go/v3"\``,
    ruby: `- \`require 'unleash'\`
- \`require 'unleash/client'\``,
    php: `- \`use Unleash\\Client\\UnleashBuilder;\`
- \`use Unleash\\Client\\Configuration\\UnleashConfiguration;\``,
    csharp: `- \`using Unleash;\`
- \`using Unleash.ClientFactory;\``,
    java: `- \`import io.getunleash.Unleash;\`
- \`import io.getunleash.DefaultUnleash;\``,
    rust: `- \`use unleash_api_client::client;\`
- \`use unleash_api_client::Client;\``,
  };

  return `### Common ${metadata.displayName} imports to remove:
${examples[language]}

**Important**: Only remove these imports if they're no longer used anywhere in the file.
`;
}
