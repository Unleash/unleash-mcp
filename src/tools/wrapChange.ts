import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerContext, handleToolError } from '../context.js';
import {
  detectLanguage,
  getLanguageMetadata,
  getSupportedLanguages,
  SupportedLanguage,
} from '../templates/languages.js';
import {
  getTemplatesForLanguage,
  getDefaultTemplate,
} from '../templates/wrapperTemplates.js';
import {
  generateSearchInstructions,
  generateWrappingInstructions,
} from '../templates/searchGuidance.js';

/**
 * Input schema for the wrap_change tool.
 */
const wrapChangeSchema = z.object({
  flagName: z.string().min(1).describe('Feature flag name to wrap the code with'),
  language: z
    .string()
    .optional()
    .describe('Programming language (auto-detected from fileName if not provided)'),
  fileName: z.string().optional().describe('File name to help detect language and patterns'),
  codeContext: z
    .string()
    .optional()
    .describe('Optional code context for detecting existing patterns'),
  frameworkHint: z
    .string()
    .optional()
    .describe('Framework hint (React, Express, Django, etc.) for specialized templates'),
});

type WrapChangeInput = z.infer<typeof wrapChangeSchema>;

/**
 * wrap_change tool implementation.
 * Generates guidance and code snippets for wrapping code changes with feature flags.
 *
 * Purpose:
 * - Provide language-specific code templates for feature flag wrapping
 * - Guide LLMs to search for existing patterns and match conventions
 * - Support multiple languages and frameworks
 * - Enable convention-aware code generation
 *
 * Design Philosophy:
 * - Prompt-based approach: provide instructions for LLM to search and match patterns
 * - Language-agnostic: support all major Unleash SDKs
 * - No network calls: pure template/guidance generation
 * - Convention-aware: detect and match existing code styles
 */
export async function wrapChange(
  context: ServerContext,
  args: unknown
): Promise<CallToolResult> {
  try {
    // Validate input
    const input: WrapChangeInput = wrapChangeSchema.parse(args);

    context.logger.info(`Generating wrapping guidance for flag "${input.flagName}"`);

    // Detect language
    const language = detectLanguage(input.fileName, input.language) as SupportedLanguage;
    const metadata = getLanguageMetadata(language);

    context.logger.debug(`Detected language: ${metadata.displayName}`);

    // Generate search instructions for finding existing patterns
    const searchInstructions = generateSearchInstructions(language, input.flagName);

    // Generate wrapping instructions
    const wrappingInstructions = generateWrappingInstructions(language, input.flagName);

    // Get all templates for this language
    const allTemplates = getTemplatesForLanguage(language, input.flagName);

    // Try to get framework-specific template if hint provided
    let recommendedTemplate = getDefaultTemplate(language, input.flagName);
    if (input.frameworkHint) {
      const frameworkTemplate = allTemplates.find(
        t =>
          t.framework?.toLowerCase().includes(input.frameworkHint!.toLowerCase())
      );
      if (frameworkTemplate) {
        recommendedTemplate = frameworkTemplate;
        context.logger.debug(`Found framework-specific template: ${input.frameworkHint}`);
      }
    }

    // Format templates for output
    const formattedTemplates = allTemplates.map(t => ({
      pattern: t.pattern,
      framework: t.framework,
      import: t.import,
      usage: t.usage,
      explanation: t.explanation,
    }));

    // Build comprehensive guidance document
    const guidanceDocument = buildGuidanceDocument({
      flagName: input.flagName,
      language: metadata.displayName,
      searchInstructions,
      wrappingInstructions,
      recommendedTemplate,
      allTemplates: formattedTemplates,
      sdkDocs: metadata.unleashSdk.docsUrl,
      frameworkHint: input.frameworkHint,
    });

    context.logger.info(
      `Generated wrapping guidance for ${metadata.displayName} with ${allTemplates.length} templates`
    );

    // Return response with comprehensive guidance
    return {
      content: [
        {
          type: 'text',
          text: guidanceDocument,
        },
      ],
      structuredContent: {
        success: true,
        flagName: input.flagName,
        detectedLanguage: language,
        languageDisplayName: metadata.displayName,
        templates: formattedTemplates,
        recommendedTemplate: {
          pattern: recommendedTemplate.pattern,
          framework: recommendedTemplate.framework,
          import: recommendedTemplate.import,
          usage: recommendedTemplate.usage,
        },
        supportedPatterns: allTemplates.map(t => t.pattern),
        sdkDocumentation: metadata.unleashSdk.docsUrl,
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'wrap_change');
  }
}

/**
 * Build the complete guidance document
 */
function buildGuidanceDocument(params: {
  flagName: string;
  language: string;
  searchInstructions: string;
  wrappingInstructions: string;
  recommendedTemplate: any;
  allTemplates: any[];
  sdkDocs: string;
  frameworkHint?: string;
}): string {
  const sections = [
    `# Feature Flag Wrapping Guide: "${params.flagName}"`,
    '',
    `**Language:** ${params.language}`,
    params.frameworkHint ? `**Framework:** ${params.frameworkHint}` : '',
    `**SDK Documentation:** ${params.sdkDocs}`,
    '',
    '---',
    '',
    '## Quick Start',
    '',
    params.frameworkHint
      ? `You indicated you are using **${params.frameworkHint}**. Here is the recommended pattern:`
      : 'Here is the recommended default pattern:',
    '',
    '### Import',
    '```' + getLanguageCodeFence(params.language),
    params.recommendedTemplate.import,
    '```',
    '',
    '### Usage',
    '```' + getLanguageCodeFence(params.language),
    params.recommendedTemplate.usage,
    '```',
    '',
    `*${params.recommendedTemplate.explanation}*`,
    '',
    '---',
    '',
    params.searchInstructions,
    '',
    '---',
    '',
    params.wrappingInstructions,
    '',
    '---',
    '',
    '## All Available Templates',
    '',
    `The following ${params.allTemplates.length} templates are available for ${params.language}:`,
    '',
    ...params.allTemplates.map((t, i) => {
      const frameworkLabel = t.framework ? ` (${t.framework})` : '';
      return `
### ${i + 1}. ${capitalizeFirst(t.pattern)}${frameworkLabel}

${t.explanation}

**Import:**
\`\`\`${getLanguageCodeFence(params.language)}
${t.import}
\`\`\`

**Usage:**
\`\`\`${getLanguageCodeFence(params.language)}
${t.usage}
\`\`\`
`;
    }),
    '',
    '---',
    '',
    '## Next Steps',
    '',
    '1. **Search for patterns** using the Grep instructions above',
    '2. **Match existing conventions** if patterns are found',
    '3. **Use default templates** if no patterns exist',
    '4. **Test your implementation** to ensure it works',
    '5. **Consider cleanup** - plan for flag removal after rollout',
    '',
    '---',
    '',
    '## Best Practices',
    '',
    '- Keep flag checks close to the code they protect',
    '- Use descriptive variable names for flag state',
    '- Consider what happens when the flag is disabled',
    '- Add comments explaining why the flag exists',
    '- Plan for flag removal (feature flags are temporary)',
    '',
    `For more information, see: ${params.sdkDocs}`,
  ];

  return sections.filter(s => s !== null && s !== undefined).join('\n');
}

/**
 * Get code fence language identifier
 */
function getLanguageCodeFence(language: string): string {
  const lowerLang = language.toLowerCase();
  const fenceMap: Record<string, string> = {
    typescript: 'typescript',
    javascript: 'javascript',
    python: 'python',
    go: 'go',
    ruby: 'ruby',
    php: 'php',
    'c#': 'csharp',
    csharp: 'csharp',
    java: 'java',
    rust: 'rust',
  };
  return fenceMap[lowerLang] || lowerLang;
}

/**
 * Capitalize first letter of string
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Tool definition for MCP server registration.
 */
export const wrapChangeTool = {
  name: 'wrap_change',
  description: `Generate code snippets and guidance for wrapping changes with feature flags.

This tool provides language-specific templates and instructions for protecting code changes with feature flags. It helps you:
- Find existing feature flag patterns in your codebase
- Match detected conventions (imports, method names, wrapping styles)
- Generate appropriate code snippets for your language/framework
- Follow Unleash SDK best practices

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

Best suited for use after evaluate_change recommends a flag and create_flag creates it.`,
  inputSchema: {
    type: 'object',
    properties: {
      flagName: {
        type: 'string',
        description:
          'Feature flag name to wrap the code with (e.g., "new-checkout-flow")',
      },
      language: {
        type: 'string',
        description: `Programming language (optional, auto-detected from fileName). Supported: ${getSupportedLanguages().join(', ')}`,
      },
      fileName: {
        type: 'string',
        description:
          'File name being modified (helps detect language, e.g., "checkout.ts")',
      },
      codeContext: {
        type: 'string',
        description:
          'Optional: surrounding code to help detect existing patterns',
      },
      frameworkHint: {
        type: 'string',
        description:
          'Optional: framework hint for specialized templates (React, Express, Django, Rails, etc.)',
      },
    },
    required: ['flagName'],
  },
};
