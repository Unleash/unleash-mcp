/**
 * Evaluate Change Tool
 *
 * Tool that provides comprehensive guidance for evaluating whether
 * code changes require feature flags. Returns formatted markdown guidance
 * that helps LLMs make informed decisions about flag usage.
 */

import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerContext, handleToolError } from '../context.js';
import {
  getFlagTypeGuidance,
  getRolloutGuidance,
  getAntiPatternWarnings,
} from '../knowledge/unleashBestPractices.js';
import { getRiskPatternGuidance } from '../evaluation/riskPatterns.js';
import { getFlagDetectionGuidance } from '../evaluation/flagDetectionPatterns.js';
import * as pb from '../prompts/promptBuilder.js';

/**
 * Input schema for the evaluate_change tool.
 * All fields are optional to allow flexible usage.
 */
const evaluateChangeInputSchema = z.object({
  repository: z.string().optional().describe('Repository name or path'),
  branch: z.string().optional().describe('Current branch name'),
  files: z.array(z.string()).optional().describe('List of files changed'),
  description: z.string().optional().describe('Description of the change'),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('User-assessed risk level'),
  codeContext: z.string().optional().describe('Surrounding code context for parent flag detection'),
});

type EvaluateChangeInput = z.infer<typeof evaluateChangeInputSchema>;

/**
 * Build the evaluation guidance content.
 */
function buildEvaluationGuidance(input?: EvaluateChangeInput): string {
  const contextSection = input ? buildContextSection(input) : '';

  return pb.buildPrompt([
    {
      content: pb.alert(
        '🚨 EVALUATION WORKFLOW',
        `You are evaluating whether code changes need feature flags.

**FOLLOW THESE STEPS:**

1. **Get the current changes** (if not already provided):
   - Use ${pb.inlineCode('Bash')} tool: ${pb.inlineCode('git diff')} or ${pb.inlineCode('git diff --staged')}
   - Use ${pb.inlineCode('Read')} tool to examine changed files

2. **Read surrounding code** for context:
   - Get full file contents to check for parent flags
   - Look for existing feature flag patterns

3. **Apply the evaluation guidelines below**

4. **Provide JSON evaluation result**

5. **Take appropriate next action** based on the result`,
        'danger'
      ),
    },
    {
      content: contextSection,
    },
    {
      title: 'Evaluation Workflow',
      content: buildWorkflowSection(),
    },
    {
      title: 'Step 1: Check for Parent Flag Coverage',
      content: buildParentFlagSection(),
    },
    {
      title: 'Step 2: Evaluate Code Characteristics',
      content: buildCodeCharacteristicsSection(),
    },
    {
      title: 'Step 3: Risk Assessment',
      content: buildRiskAssessmentSection(),
    },
    {
      title: 'Output Format',
      content: buildOutputFormatSection(),
    },
    {
      title: 'Next Actions (MANDATORY)',
      content: buildNextActionsSection(),
    },
    {
      title: 'Best Practices Reference',
      content: buildBestPracticesSection(),
    },
  ]);
}

/**
 * Build context section if input is provided
 */
function buildContextSection(input: EvaluateChangeInput): string {
  if (!input || Object.keys(input).length === 0) {
    return '';
  }

  let content = pb.section('Context Provided', 2);

  if (input.repository) {
    content += `**Repository**: ${input.repository}\n`;
  }
  if (input.branch) {
    content += `**Branch**: ${input.branch}\n`;
  }
  if (input.files && input.files.length > 0) {
    content += `**Files**: ${input.files.join(', ')}\n`;
  }
  if (input.description) {
    content += `**Description**: ${input.description}\n`;
  }
  if (input.riskLevel) {
    content += `**User-assessed risk**: ${input.riskLevel}\n`;
  }

  content += '\n';

  if (input.codeContext) {
    content += pb.subsection('Code Context', pb.codeBlock(input.codeContext));
  }

  return content;
}

/**
 * Build workflow section
 */
function buildWorkflowSection(): string {
  return pb.workflow('Evaluation Process', [
    {
      step: 'Gather Code Changes',
      details: 'Use git commands or ask the user to identify what code is being changed. Read the files to get full context.',
    },
    {
      step: 'Check Parent Flag Coverage',
      details: 'Scan surrounding code for existing feature flag checks. If found and covering the change location, STOP - no new flag needed.',
    },
    {
      step: 'Assess Code Type',
      details: 'Determine if this is test code, config, bug fix, refactor, or new feature.',
    },
    {
      step: 'Evaluate Risk',
      details: 'Analyze for risky patterns (auth, payments, database, API changes). Calculate risk score.',
    },
    {
      step: 'Make Recommendation',
      details: 'Decide: create new flag, use existing flag, or no flag needed.',
    },
    {
      step: 'Take Action',
      details: 'Follow the mandatory next actions based on your recommendation.',
    },
  ]);
}

/**
 * Build parent flag detection section
 */
function buildParentFlagSection(): string {
  let content = pb.alert(
    'FIRST AND MOST IMPORTANT',
    'Scan for existing feature flag checks that might already cover this code. Nesting flags inside other flags creates unnecessary complexity.',
    'warning'
  );

  content += pb.subsection(
    'Why This Matters',
    'If code is already protected by a parent flag, adding another flag is redundant and creates technical debt. Always check for parent coverage first.'
  );

  content += pb.subsection(
    'Flag Detection Patterns (Cross-Language)',
    getFlagDetectionGuidance()
  );

  content += pb.subsection(
    'Decision Logic',
    pb.decisionTree([
      {
        condition: 'Parent flag found covering the lineNumber',
        result: 'No new flag needed',
        reasoning: 'Code is already protected by existing flag',
      },
      {
        condition: 'Surrounding code or lineNumber not provided',
        result: 'Cannot determine parent coverage',
        reasoning: 'Proceed to evaluate if flag needed, but note detection was skipped',
      },
      {
        condition: 'No parent flag found',
        result: 'Proceed to Step 2',
        reasoning: 'Evaluate code characteristics to determine if new flag needed',
      },
    ])
  );

  return content;
}

/**
 * Build code characteristics section
 */
function buildCodeCharacteristicsSection(): string {
  let content = 'If NOT already covered by a parent flag, analyze what type of code this is:\n\n';

  content += pb.subsection(
    '❌ These DO NOT Need Flags',
    pb.list([
      `${pb.emphasis('Test Code', 'bold')}: Files matching *.test.*, *.spec.*, __tests__/*, test_*.py, *_test.go, etc.`,
      `${pb.emphasis('Configuration Files', 'bold')}: *.config.*, .env, *.yaml, *.json, config/**, settings.py`,
      `${pb.emphasis('Documentation', 'bold')}: *.md, *.mdx, docs/**, README, CHANGELOG`,
      `${pb.emphasis('Low-Risk Bug Fixes', 'bold')}: Small changes (<20 lines) fixing typos, validation, edge cases (no risky operations)`,
      `${pb.emphasis('Low-Risk Refactors', 'bold')}: Code reorganization without behavior changes, renaming, cleanup (no risky operations)`,
      `${pb.emphasis('Simple Changes', 'bold')}: Very small changes (<20 lines) with no risky operations`,
    ])
  );

  content += pb.subsection(
    '✅ These DO Need Flags',
    pb.list([
      `${pb.emphasis('New Features', 'bold')}: Adding new user-facing functionality or capabilities`,
      `${pb.emphasis('High-Risk Operations', 'bold')}: Auth, payments, security, database operations, external services`,
      `${pb.emphasis('API Changes', 'bold')}: New endpoints, modified contracts, breaking changes`,
      `${pb.emphasis('Large Changes', 'bold')}: Changes >50 lines, especially >100 lines`,
      `${pb.emphasis('Async Operations', 'bold')}: New async functions, promises, background jobs`,
    ])
  );

  return content;
}

/**
 * Build risk assessment section
 */
function buildRiskAssessmentSection(): string {
  let content = pb.subsection(
    'Risk Patterns',
    'Use these patterns to identify risky code and calculate a risk score:\n\n' + getRiskPatternGuidance()
  );

  content += pb.subsection(
    'Risk Scoring',
    pb.list([
      'Critical pattern match: +5 points',
      'High pattern match: +3 points',
      'Medium pattern match: +2 points',
      'Code >100 lines: +2 points',
      'Code 50-100 lines: +1 point',
    ], true) +
    '\n' +
    pb.table(
      ['Risk Level', 'Score Range', 'Flag Required?'],
      [
        ['Critical', '≥ 5', 'YES - Absolutely'],
        ['High', '3-4', 'YES - Strongly recommended'],
        ['Medium', '2', 'MAYBE - Consider context'],
        ['Low', '< 2', 'NO - Usually not needed'],
      ]
    )
  );

  return content;
}

/**
 * Build output format section
 */
function buildOutputFormatSection(): string {
  const schema = {
    needsFlag: 'boolean',
    reason: 'already_covered | new_feature | configuration_change | bug_fix | refactor | test_code | low_risk_change',
    recommendation: 'use_existing | create_new | no_flag_needed',
    existingFlag: {
      name: 'string (flag name)',
      location: 'string (file:line)',
      coverageScope: 'entire_module | parent_function | ancestor_block',
    },
    suggestedFlag: 'string (descriptive flag name) | null',
    riskLevel: 'low | medium | high | critical',
    riskScore: 'number (calculated score)',
    explanation: 'string (clear reasoning)',
    confidence: 'number (0.0 to 1.0)',
  };

  let content = 'Provide your evaluation in this JSON structure:\n\n';
  content += pb.jsonSchema(schema);

  content += pb.subsection(
    'Field Descriptions',
    pb.list([
      `${pb.inlineCode('needsFlag')}: Boolean indicating if a feature flag is needed`,
      `${pb.inlineCode('reason')}: Why you made this decision`,
      `${pb.inlineCode('recommendation')}: What action to take next`,
      `${pb.inlineCode('existingFlag')}: If covered by parent flag, provide details`,
      `${pb.inlineCode('suggestedFlag')}: If new flag needed, suggest a descriptive name`,
      `${pb.inlineCode('riskLevel')}: Assessed risk level`,
      `${pb.inlineCode('riskScore')}: Numerical risk score you calculated`,
      `${pb.inlineCode('explanation')}: Clear, detailed reasoning for your decision`,
      `${pb.inlineCode('confidence')}: How confident you are (more context = higher confidence)`,
    ])
  );

  return content;
}

/**
 * Build next actions section
 */
function buildNextActionsSection(): string {
  let content = pb.alert(
    'CRITICAL',
    'After providing the evaluation JSON above, you MUST take the appropriate next action. Do not stop at evaluation.',
    'danger'
  );

  content += pb.subsection(
    '❌ If needsFlag is FALSE (no flag needed)',
    `**Action**: Tell the user no flag is needed and explain why. Then proceed with implementing the code without a flag.\n\n` +
    `Example: "Based on my evaluation, this change does not require a feature flag because it is a small bug fix with no risky operations. I'll proceed with implementing the change directly."`
  );

  content += pb.subsection(
    '✅ If needsFlag is TRUE (flag needed)',
    'You MUST immediately perform these actions:\n\n' +
    pb.workflow('Flag Creation Workflow', [
      {
        step: 'Determine Flag Name',
        details: `If ${pb.inlineCode('recommendation')} is "use_existing": Use the flag name from ${pb.inlineCode('existingFlag.name')}\n\n` +
          `If ${pb.inlineCode('recommendation')} is "create_new": Call ${pb.inlineCode('create_flag')} tool with the ${pb.inlineCode('suggestedFlag')} name`,
      },
      {
        step: 'Wrap the Code',
        details: 'Analyze the codebase for existing flag usage patterns (use Grep to search for flag checks). ' +
          'Then wrap your code changes to match the existing patterns in the codebase. ' +
          'If no existing patterns found, use idiomatic patterns for the language.',
      },
      {
        step: 'Test and Verify',
        details: 'Ensure the wrapped code compiles and follows project conventions.',
      },
    ])
  );

  return content;
}

/**
 * Build best practices section
 */
function buildBestPracticesSection(): string {
  let content = pb.subsection(
    'Flag Type Selection',
    getFlagTypeGuidance()
  );

  content += pb.subsection(
    'Rollout Strategy Recommendations',
    getRolloutGuidance()
  );

  content += pb.subsection(
    'Anti-Patterns to Avoid',
    getAntiPatternWarnings()
  );

  content += pb.subsection(
    'Documentation',
    pb.list([
      pb.link('Unleash Best Practices', 'https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale'),
      pb.link('Feature Flag Types', 'https://docs.getunleash.io/topics/feature-flags/feature-flag-types'),
      pb.link('Activation Strategies', 'https://docs.getunleash.io/reference/activation-strategies'),
    ])
  );

  return content;
}

/**
 * evaluate_change tool implementation.
 */
export async function evaluateChange(
  context: ServerContext,
  args: unknown
): Promise<CallToolResult> {
  try {
    // Validate input (all fields optional)
    const input: EvaluateChangeInput = evaluateChangeInputSchema.parse(args || {});

    context.logger.info('Generating evaluation guidance', input);

    // Build the evaluation guidance
    const guidance = buildEvaluationGuidance(input);

    return {
      content: [
        {
          type: 'text',
          text: guidance,
        },
      ],
    };
  } catch (error) {
    return handleToolError(context, error, 'evaluate_change');
  }
}

/**
 * Tool definition for MCP server registration.
 */
export const evaluateChangeTool = {
  name: 'evaluate_change',
  description: `Provides comprehensive guidance for evaluating whether code changes require feature flags.

This tool returns detailed evaluation guidelines including:
- Workflow for systematic evaluation
- Parent flag detection patterns (avoid nesting)
- Risk assessment criteria
- Code type evaluation (test, config, feature, etc.)
- Decision tree logic
- Best practices from Unleash documentation

Use this tool when:
- Starting work on a new feature or change
- Unsure if a feature flag is needed
- Want guidance on rollout strategy
- Need help choosing flag type

The tool returns markdown-formatted guidance that helps you make informed decisions about feature flag usage.`,
  inputSchema: {
    type: 'object',
    properties: {
      repository: {
        type: 'string',
        description: 'Repository name or path (optional)',
      },
      branch: {
        type: 'string',
        description: 'Current branch name (optional)',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of files changed (optional)',
      },
      description: {
        type: 'string',
        description: 'Description of the change (optional)',
      },
      riskLevel: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'User-assessed risk level (optional)',
      },
      codeContext: {
        type: 'string',
        description: 'Surrounding code context for parent flag detection (optional)',
      },
    },
  },
};
