/**
 * Flag Discovery Module
 *
 * Implements intelligent strategies for discovering existing feature flags
 * in the codebase to prevent duplicate flag creation and encourage reuse.
 *
 * Detection Strategies:
 * 1. File-based: Search in modified files for existing flag usage
 * 2. Git history: Analyze recent commits for flag additions
 * 3. Semantic matching: Match description to flag names in codebase
 * 4. Code context: Analyze surrounding code for related flags
 */

import { allFlagPatterns } from '../evaluation/flagDetectionPatterns.js';

/**
 * Represents a discovered flag candidate
 */
export interface FlagCandidate {
  name: string;
  location: string;      // file:line
  context: string;       // code snippet
  score: number;         // 0.0 to 1.0
  detectionMethod: 'file-based' | 'git-history' | 'semantic' | 'code-context' | 'unleash-inventory';
  reasoning: string;
}

/**
 * Input for flag discovery
 */
export interface DiscoveryInput {
  description: string;
  files?: string[];
  codeContext?: string;
  defaultProject?: string;
}

/**
 * Build instructions for leveraging Unleash inventory resources.
 */
export function buildUnleashInventoryInstructions(
  description: string,
  defaultProject?: string
): string {
  const baseNote =
    '> You cannot open the Unleash UI yourself. Ask the user to review the relevant project/flag in the Unleash console if human confirmation is required.';

  const sharedSteps = `
**Step 3**: Evaluate matches.
- Consider semantic similarity between your change description and each flag's name/description.
- Prefer non-archived flags. Note if a flag is archived and adjust scoring accordingly.
- Record promising matches with the project ID and the flag URL so they can be reviewed quickly.

**Step 4**: Score and report.
- Assign an \`unleash-inventory\` score (0.0 - 1.0) based on how well the existing flag aligns with the proposed change.
- Provide reasoning that references project and flag metadata (name, description, type, URL).

${baseNote}`.trim();

  if (defaultProject) {
    const encodedProjectId = encodeURIComponent(defaultProject);
    return `
## Unleash Inventory Analysis

Use the MCP resources to discover existing flags already defined in Unleash so you can reuse them instead of creating duplicates.

**Step 1**: Focus on the configured default project **${defaultProject}**.
- Optionally call \`resources/read\` with \`unleash://projects?order=desc&limit=200\` to confirm its metadata (filter to the entry whose 'id' matches "${defaultProject}").
- Do not evaluate other projects unless the default project clearly does not align with the change. If uncertain, ask the user for guidance before proceeding.

**Step 2**: Inspect feature flags for the default project.
- Call \`resources/read\` with \`unleash://projects/${encodedProjectId}/feature-flags?order=asc&limit=200\`.
- Review the returned flag names, descriptions, types, archived status and URLs.
- Pay close attention to flags whose descriptions, rollout intent, or ownership align with "${description}".

${sharedSteps}
`.trim();
  }

  return `
## Unleash Inventory Analysis

Use the MCP resources to discover existing flags already defined in Unleash so you can reuse them instead of creating duplicates.

**Step 1**: List available projects.
- Call \`resources/read\` with \`unleash://projects?order=desc&limit=200\` to retrieve project metadata (names, descriptions, URLs).
- Identify the project whose name or description best aligns with the feature description for "${description}".
- If multiple projects seem relevant, shortlist up to 3 and justify your selection.
- If you cannot determine a suitable project, explicitly ask the user which project to target before proceeding.

**Step 2**: Inspect feature flags for each shortlisted project.
- For each candidate project, call \`resources/read\` with \`unleash://projects/<projectId>/feature-flags?order=asc&limit=200\`.
- Review the returned flag names, descriptions, types, archived status and URLs.
- Pay close attention to flags whose descriptions, rollout intent, or ownership align with "${description}".

${sharedSteps}
`.trim();
}

/**
 * Build search instructions for file-based detection
 *
 * Returns guidance for the LLM to search files for existing flags
 */
export function buildFileBasedSearchInstructions(files?: string[]): string {
  const searchArea = files && files.length > 0
    ? `the following files:\n${files.map(f => `  - ${f}`).join('\n')}`
    : 'the files you are modifying';

  const patterns = [
    ...allFlagPatterns.conditionals,
    ...allFlagPatterns.assignments,
    ...allFlagPatterns.hooks,
    ...allFlagPatterns.guards,
  ];

  const regexPatterns = patterns
    .flatMap(p => p.regexPatterns)
    .slice(0, 10); // Top 10 most common patterns

  return `
## File-Based Flag Detection

Search for existing feature flags in ${searchArea}.

**Step 1**: Use the \`Grep\` tool with these patterns to find flag checks:

${regexPatterns.map((pattern, i) => `${i + 1}. Pattern: \`${pattern}\`
   Command: Grep with pattern="${pattern}" and output_mode="content" and -n=true`).join('\n\n')}

**Step 2**: For each match found:
- Extract the flag name from the match
- Note the file and line number
- Read surrounding code for context (±5 lines)

**Step 3**: Score each flag found:
- Same file as modification: score = 0.8
- Same directory as modification: score = 0.6
- Same module/package: score = 0.4
- Other location: score = 0.2

**Step 4**: Return the highest-scoring flag candidate.
`.trim();
}

/**
 * Build search instructions for git history detection
 */
export function buildGitHistorySearchInstructions(): string {
  return `
## Git History Flag Detection

Search recent git commits for flag additions.

**Step 1**: Search commit diffs for flag-related changes:

\`\`\`bash
git log -p --all -S "isEnabled" -n 50 --pretty=format:"%H|%an|%ad|%s" --date=short
\`\`\`

Look for patterns:
- \`isEnabled('flag-name')\`
- \`useFlag('flag-name')\`
- \`is_enabled('flag-name')\`

**Step 2**: Search commit messages for flag keywords:

\`\`\`bash
git log --all --grep="flag\\|feature\\|toggle" -n 20 --pretty=format:"%H|%an|%ad|%s" --date=short
\`\`\`

**Step 3**: For each flag found, calculate recency score:
- Committed in last week: score = 0.8
- Committed in last month: score = 0.6
- Committed in last 3 months: score = 0.4
- Older than 3 months: score = 0.2

**Step 4**: Extract flag names and their context from the diffs.

**Step 5**: Return the most recent, relevant flag.
`.trim();
}

/**
 * Build search instructions for semantic name matching
 */
export function buildSemanticMatchingInstructions(description: string): string {
  // Generate potential flag names from description
  const words = description.toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .split(/\s+/)
    .filter(w => w.length > 3); // Filter short words

  // Common flag name patterns
  const potentialNames = new Set<string>();

  // Add individual words
  words.forEach(w => potentialNames.add(w));

  // Add common combinations
  if (words.length >= 2) {
    potentialNames.add(words.slice(0, 2).join('-'));
    potentialNames.add(words.join('-'));
  }

  // Add common prefixes/suffixes
  words.forEach(w => {
    potentialNames.add(`enable-${w}`);
    potentialNames.add(`new-${w}`);
    potentialNames.add(`${w}-feature`);
    potentialNames.add(`${w}-flag`);
  });

  const searchPatterns = Array.from(potentialNames)
    .filter(n => n.length >= 4)
    .slice(0, 15); // Top 15 patterns

  return `
## Semantic Name Matching

Based on your description: "${description}"

Search the codebase for flags with semantically similar names.

**Step 1**: Potential flag names to search for:
${searchPatterns.map(p => `  - "${p}"`).join('\n')}

**Step 2**: For each potential name, use \`Grep\` to search:

\`\`\`
Grep with pattern="isEnabled\\(['\\"]${searchPatterns[0]}|useFlag\\(['\\"]${searchPatterns[0]}" output_mode="files_with_matches"
\`\`\`

Repeat for each potential name.

**Step 3**: Score matches based on name similarity:
- Exact match: score = 1.0
- Contains all words from description: score = 0.8
- Contains some words: score = 0.6
- Partial word match: score = 0.4

**Step 4**: If matches found, read the files to see flag usage context.

**Step 5**: Return the best semantic match with context.
`.trim();
}

/**
 * Build search instructions for code context analysis
 */
export function buildCodeContextInstructions(codeContext?: string): string {
  if (!codeContext) {
    return `
## Code Context Analysis

No code context provided. Skip this detection method.
`.trim();
  }

  return `
## Code Context Analysis

Analyze the provided code context for existing feature flag patterns.

**Step 1**: Scan the code context for flag patterns:

${allFlagPatterns.conditionals
    .flatMap(p => p.regexPatterns)
    .slice(0, 5)
    .map((pattern, i) => `${i + 1}. Look for: \`${pattern}\``).join('\n')}

**Step 2**: For any flags found:
- Extract the flag name
- Determine the scope (braces, indentation, guard clause)
- Check if the modification point would be inside this flag's scope

**Step 3**: Score based on proximity:
- Flag directly wraps modification point: score = 1.0
- Flag in same function: score = 0.7
- Flag in same class/module: score = 0.5
- Flag elsewhere in file: score = 0.3

**Step 4**: Return flag with highest proximity score.
`.trim();
}

/**
 * Generate comprehensive flag discovery instructions
 *
 * Returns a complete markdown document with all detection strategies
 */
export function generateDiscoveryInstructions(input: DiscoveryInput): string {
  const sections = [
    {
      title: 'Overview',
      content: `You are searching for existing feature flags in the codebase that might already cover the functionality described as: "${input.description}"

**Goal**: Find the most relevant existing flag to avoid creating duplicates.

**Detection Methods**:
1. Unleash inventory analysis (projects & existing flags)
2. File-based detection (search in modified files)
3. Git history analysis (recent flag additions)
4. Semantic name matching (description → flag names)
${input.codeContext ? '5. Code context analysis (flags near modification point)' : ''}

**Instructions**: Execute ALL applicable detection methods below, then combine results to find the best candidate.`,
    },
    {
      title: '1. Unleash Inventory Analysis',
      content: buildUnleashInventoryInstructions(
        input.description,
        input.defaultProject
      ),
    },
    {
      title: '2. File-Based Detection',
      content: buildFileBasedSearchInstructions(input.files),
    },
    {
      title: '3. Git History Detection',
      content: buildGitHistorySearchInstructions(),
    },
    {
      title: '4. Semantic Name Matching',
      content: buildSemanticMatchingInstructions(input.description),
    },
  ];

  if (input.codeContext) {
    sections.push({
      title: '5. Code Context Analysis',
      content: buildCodeContextInstructions(input.codeContext),
    });
  }

  sections.push({
    title: 'Combining Results',
    content: `
## How to Combine Results

After executing all detection methods, you will have multiple flag candidates with scores.

**Step 1**: Calculate weighted final score for each candidate:
- Unleash inventory score × 0.25
- File-based score × 0.30
- Git history score × 0.15
- Semantic matching score × 0.20
- Code context score × 0.10

**Step 2**: Select the candidate with the highest weighted score.

**Step 3**: Calculate confidence level:
- High confidence (≥0.7): Strong match, recommend using this flag
- Medium confidence (0.4-0.7): Possible match, present as option
- Low confidence (<0.4): Weak match, probably better to create new flag

**Step 4**: Return evaluation in this JSON format:

\`\`\`json
{
  "flagFound": true,
  "candidate": {
    "name": "stripe-payment-integration",
    "location": "src/payments/stripe.ts:42" | "unleash:project-id/flag-name",
    "context": "if (client.isEnabled('stripe-payment-integration')) {",
    "confidence": 0.85,
    "reasoning": "Found in the same file you're modifying, added 2 days ago, name matches 'payment' from your description",
    "detectionMethod": "file-based" | "unleash-inventory" | ...
  }
}
\`\`\`

Or if no good match:

\`\`\`json
{
  "flagFound": false,
  "candidate": null
}
\`\`\`
`.trim(),
  });

  // Build complete markdown document
  return sections
    .map(section => `# ${section.title}\n\n${section.content}`)
    .join('\n\n---\n\n');
}
