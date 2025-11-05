/**
 * Detect Flag Tool
 *
 * Intelligently discovers existing feature flags in the codebase to prevent
 * duplicate flag creation and encourage flag reuse.
 *
 * This tool provides comprehensive search instructions for the LLM to execute
 * multiple detection strategies (file-based, git history, semantic matching,
 * code context) and combine the results to find the best existing flag candidate.
 *
 * Workflow:
 * 1. LLM calls detect_flag with description
 * 2. Tool returns search instructions
 * 3. LLM executes searches using Bash/Grep tools
 * 4. LLM combines results and returns best candidate
 * 5. Tool integrates result into evaluation workflow
 */

import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerContext, handleToolError } from '../context.js';
import { generateDiscoveryInstructions, DiscoveryInput } from '../detection/flagDiscovery.js';
import { getScoringGuidance } from '../detection/flagScoring.js';

/**
 * Input schema for the detect_flag tool
 */
const detectFlagInputSchema = z.object({
  description: z.string().min(1).describe('Description of the change or feature to find flags for'),
  files: z.array(z.string()).optional().describe('Optional list of files being modified'),
  codeContext: z.string().optional().describe('Optional code context to analyze for nearby flags'),
});

type DetectFlagInput = z.infer<typeof detectFlagInputSchema>;

/**
 * detect_flag tool implementation
 *
 * Returns comprehensive search instructions for discovering existing flags
 * in the codebase. The LLM will execute these instructions and return
 * the best candidate flag.
 */
export async function detectFlag(
  context: ServerContext,
  args: unknown
): Promise<CallToolResult> {
  try {
    // Validate input
    const input: DetectFlagInput = detectFlagInputSchema.parse(args);

    context.logger.info('Generating flag detection instructions', {
      description: input.description,
      filesCount: input.files?.length ?? 0,
      hasCodeContext: !!input.codeContext,
    });

    // Build discovery input
    const discoveryInput: DiscoveryInput = {
      description: input.description,
      files: input.files,
      codeContext: input.codeContext,
      defaultProject: context.config.unleash.defaultProject,
    };

    // Generate comprehensive search instructions
    const instructions = generateDiscoveryInstructions(discoveryInput);
    const scoringGuidance = getScoringGuidance();

    // Build complete guidance document
    const guidance = buildDetectionGuidance(instructions, scoringGuidance, input.description);

    return {
      content: [
        {
          type: 'text',
          text: guidance,
        },
      ],
    };
  } catch (error) {
    return handleToolError(context, error, 'detect_flag');
  }
}

/**
 * Build complete detection guidance document
 */
function buildDetectionGuidance(
  instructions: string,
  scoringGuidance: string,
  description: string
): string {
  return `
# Existing Flag Detection

You are searching for existing feature flags that might already cover: **"${description}"**

**Goal**: Find the best existing flag to reuse, avoiding duplicate flag creation.

---

${instructions}

---

${scoringGuidance}

---

## Important Notes

1. **Execute ALL detection methods** (file-based, git history, semantic) to find the best match
2. **Use actual tools** (Bash for git commands, Grep for code search, Read for file contents)
3. **Combine scores** from all methods using the weights above
4. **Return JSON result** with the best candidate (or null if no good match)
5. **Be thorough** - search comprehensively before concluding no match exists

## What to Return

After executing all detection methods and combining results, return your findings in this JSON format:

### If flag found:
\`\`\`json
{
  "flagFound": true,
  "candidate": {
    "name": "existing-flag-name",
    "location": "src/path/to/file.ts:42",
    "context": "if (client.isEnabled('existing-flag-name')) {",
    "confidence": 0.85,
    "reasoning": "Found in the same file you're modifying, added last week, name matches your description",
    "detectionMethod": "file-based"
  }
}
\`\`\`

### If no good match:
\`\`\`json
{
  "flagFound": false,
  "candidate": null
}
\`\`\`

**Remember**:
- Confidence ≥0.7 = High confidence (strong recommendation to reuse)
- Confidence 0.4-0.7 = Medium confidence (possible match, ask user)
- Confidence <0.4 = Low confidence (better to create new flag)

Start by executing the file-based detection first, as it's often the most relevant.
`.trim();
}

/**
 * Tool definition for MCP server registration
 */
export const detectFlagTool = {
  name: 'detect_flag',
  description: `Discover existing feature flags in the codebase to prevent duplicates and encourage reuse.

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
indicating whether a flag was found and, if so, its details with a confidence score.`,
  inputSchema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Description of the change or feature you want to find flags for (e.g., "payment processing with Stripe")',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: List of files being modified to search for flags in the same area',
      },
      codeContext: {
        type: 'string',
        description: 'Optional: Code context around the modification point to analyze for nearby flags',
      },
    },
    required: ['description'],
  },
};
