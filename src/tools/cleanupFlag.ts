/**
 * Cleanup Flag Tool
 *
 * Provides comprehensive instructions for removing feature flag code from the codebase
 * while preserving the desired code path (enabled or disabled).
 *
 * This tool follows the instruction-based pattern used by wrap_change and detect_flag:
 * it returns detailed guidance for the LLM to execute the cleanup autonomously.
 *
 * Workflow:
 * 1. User calls cleanup_flag with flag name and preserve path
 * 2. Tool returns comprehensive cleanup instructions
 * 3. LLM follows instructions to find and remove flag code
 * 4. LLM reports back with summary of changes
 */

import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerContext, handleToolError } from '../context.js';
import {
  generateCleanupInstructions,
  generateImportCleanupGuidance,
  PreservePath,
} from '../templates/cleanupGuidance.js';
import { detectLanguage, SupportedLanguage } from '../templates/languages.js';

/**
 * Input schema for the cleanup_flag tool
 */
const cleanupFlagInputSchema = z.object({
  flagName: z
    .string()
    .min(1)
    .describe('Name of the feature flag to remove from the codebase'),
  preservePath: z
    .enum(['enabled', 'disabled'])
    .optional()
    .describe(
      'Which code path to preserve: "enabled" keeps the code that runs when flag is true, "disabled" keeps the code that runs when flag is false. If not provided, instructions will guide you to ask the user.'
    ),
  files: z
    .array(z.string())
    .optional()
    .describe(
      'Optional: Specific files to clean up. If not provided, searches entire codebase'
    ),
  language: z
    .string()
    .optional()
    .describe(
      'Optional: Programming language hint for language-specific guidance (auto-detected from files if not provided)'
    ),
});

type CleanupFlagInput = z.infer<typeof cleanupFlagInputSchema>;

/**
 * cleanup_flag tool implementation
 *
 * Returns comprehensive instructions for removing feature flag code while
 * preserving the desired code path. The LLM follows these instructions to
 * autonomously clean up the flag.
 */
export async function cleanupFlag(
  context: ServerContext,
  args: unknown
): Promise<CallToolResult> {
  try {
    // Validate input
    const input: CleanupFlagInput = cleanupFlagInputSchema.parse(args);

    context.logger.info('Generating flag cleanup instructions', {
      flagName: input.flagName,
      preservePath: input.preservePath ?? 'not specified',
      filesCount: input.files?.length ?? 0,
      language: input.language,
    });

    // If preservePath not provided, return instructions to ask the user
    if (!input.preservePath) {
      return buildAskUserGuidance(input.flagName, input.files);
    }

    // Detect language if files provided and language not specified
    let detectedLanguage: SupportedLanguage | undefined;
    if (input.files && input.files.length > 0 && !input.language) {
      // Try to detect from first file
      detectedLanguage = detectLanguage(input.files[0], undefined) as SupportedLanguage;
      context.logger.debug(`Detected language: ${detectedLanguage}`);
    } else if (input.language) {
      detectedLanguage = detectLanguage(undefined, input.language) as SupportedLanguage;
    }

    // Generate comprehensive cleanup instructions
    const cleanupInstructions = generateCleanupInstructions(
      input.flagName,
      input.preservePath as PreservePath,
      input.files
    );

    // Add language-specific import cleanup guidance if language detected
    let importGuidance = '';
    if (detectedLanguage) {
      importGuidance = `\n---\n\n${generateImportCleanupGuidance(detectedLanguage)}`;
    }

    // Build complete guidance document
    const guidance = buildCleanupGuidance(
      input.flagName,
      input.preservePath as PreservePath,
      cleanupInstructions,
      importGuidance,
      input.files
    );

    context.logger.info(
      `Generated cleanup guidance for flag "${input.flagName}" (preserve: ${input.preservePath})`
    );

    return {
      content: [
        {
          type: 'text',
          text: guidance,
        },
      ],
      structuredContent: {
        success: true,
        flagName: input.flagName,
        preservePath: input.preservePath,
        targetFiles: input.files,
        detectedLanguage,
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'cleanup_flag');
  }
}

/**
 * Build guidance that instructs the LLM to ask the user which path to preserve
 */
function buildAskUserGuidance(flagName: string, files?: string[]): CallToolResult {
  const scope = files && files.length > 0
    ? `in ${files.length} specific file(s)`
    : 'across the codebase';

  const guidance = `# Feature Flag Cleanup: "${flagName}"

## ⚠️ User Input Required

Before proceeding with cleanup ${scope}, you need to determine which code path to preserve.

---

## Ask the User

Use the **AskUserQuestion** tool to ask the user which path they want to keep:

**Question**: "Which code path should be preserved when removing the '${flagName}' flag?"

**Options**:
1. **"enabled"** - Keep the code that runs when the flag is TRUE/enabled
   - Use this when the feature has been rolled out successfully and you want to keep the new behavior
   - This is the most common choice for completed feature rollouts

2. **"disabled"** - Keep the code that runs when the flag is FALSE/disabled
   - Use this when removing an experimental feature that didn't work out
   - Use this for kill switches that are being removed
   - Use this when reverting to the original behavior

---

## After the User Responds

Once you know which path to preserve, call this tool again with the **preservePath** parameter:

\`\`\`
cleanup_flag({
  flagName: "${flagName}",
  preservePath: "enabled" or "disabled",  // Based on user's answer
  ${files ? `files: ${JSON.stringify(files)}` : '// files: optional'}
})
\`\`\`

---

## Context to Help the User Decide

Before asking, you may want to:
1. Search for the flag to see how it's being used
2. Check recent commits to understand the flag's history
3. Look at the code paths to explain what each choice means

This context can help the user make an informed decision.
`;

  return {
    content: [
      {
        type: 'text',
        text: guidance,
      },
    ],
    structuredContent: {
      success: true,
      requiresUserInput: true,
      flagName,
      targetFiles: files,
      nextStep: 'Ask user which path to preserve using AskUserQuestion tool',
    },
  };
}

/**
 * Build complete cleanup guidance document
 */
function buildCleanupGuidance(
  flagName: string,
  preservePath: PreservePath,
  cleanupInstructions: string,
  importGuidance: string,
  files?: string[]
): string {
  const scope = files && files.length > 0
    ? `in ${files.length} specific file(s)`
    : 'across the codebase';

  const pathEmoji = preservePath === 'enabled' ? '✅' : '❌';
  const preserveDescription = preservePath === 'enabled'
    ? 'the code runs as if the flag is **always enabled**'
    : 'the code runs as if the flag is **always disabled**';

  return `# Feature Flag Cleanup: "${flagName}"

## Summary

You are removing the feature flag **"${flagName}"** ${scope}.

**Preserve Path**: ${pathEmoji} **${preservePath.toUpperCase()}**

This means ${preserveDescription}.

---

${cleanupInstructions}

${importGuidance}

---

## Final Reminder

After completing the cleanup:
1. **Verify**: Search again to confirm no references remain
2. **Test**: Run tests to ensure functionality is preserved
3. **Review**: Check complex cases manually
4. **Report**: Provide a summary of files changed and any issues found

**Remember**: You're preserving the **${preservePath}** path and removing the **${preservePath === 'enabled' ? 'disabled' : 'enabled'}** path.

Good luck! Take your time and be thorough. 🧹
`;
}

/**
 * Tool definition for MCP server registration
 */
export const cleanupFlagTool = {
  name: 'cleanup_flag',
  description: `Remove a feature flag from the codebase while preserving the desired code path.

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
See: https://github.com/Unleash/unleash/blob/main/.github/workflows/ai-flag-cleanup-pr.yml`,
  inputSchema: {
    type: 'object',
    properties: {
      flagName: {
        type: 'string',
        description: 'Name of the feature flag to remove (e.g., "new-checkout-flow")',
      },
      preservePath: {
        type: 'string',
        enum: ['enabled', 'disabled'],
        description:
          'Optional: Which code path to preserve: "enabled" = keep code that runs when flag is true (typical for rollouts), "disabled" = keep code that runs when flag is false (for removed features). If not provided, you will be instructed to ask the user.',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional: Specific files to clean up. If not provided, searches entire codebase. Useful for partial cleanup or when you already know which files contain the flag.',
      },
      language: {
        type: 'string',
        description:
          'Optional: Programming language for specialized guidance (e.g., "typescript", "python", "go"). Auto-detected from files if not provided.',
      },
    },
    required: ['flagName'],
  },
};
