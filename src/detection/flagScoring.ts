/**
 * Flag Scoring and Ranking Module
 *
 * Provides types, utilities, and helper functions for scoring and ranking
 * discovered flag candidates. The actual scoring is performed by the LLM
 * following the guidance in flagDiscovery.ts, but this module provides
 * the type definitions and validation logic.
 */

import { FlagCandidate } from './flagDiscovery.js';

/**
 * Confidence level for flag matches
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Detection result with confidence assessment
 */
export interface DetectionResult {
  flagFound: boolean;
  candidate: FlagCandidate | null;
  confidenceLevel: ConfidenceLevel;
  recommendation: 'use_existing' | 'ask_user' | 'create_new';
}

/**
 * Weights for combining detection method scores
 */
export const DETECTION_WEIGHTS = {
  'unleash-inventory': 0.25,
  'file-based': 0.3,
  'git-history': 0.15,
  'semantic': 0.2,
  'code-context': 0.1,
} as const;

/**
 * Confidence thresholds
 */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.7,
  medium: 0.4,
} as const;

/**
 * Calculate confidence level from score
 */
export function calculateConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_THRESHOLDS.high) {
    return 'high';
  }
  if (score >= CONFIDENCE_THRESHOLDS.medium) {
    return 'medium';
  }
  return 'low';
}

/**
 * Determine recommendation based on confidence level
 */
export function determineRecommendation(confidenceLevel: ConfidenceLevel): 'use_existing' | 'ask_user' | 'create_new' {
  switch (confidenceLevel) {
    case 'high':
      return 'use_existing';
    case 'medium':
      return 'ask_user';
    case 'low':
      return 'create_new';
  }
}

/**
 * Get explanation for confidence level
 */
export function getConfidenceExplanation(confidenceLevel: ConfidenceLevel): string {
  switch (confidenceLevel) {
    case 'high':
      return 'Strong match found. This flag very likely covers your use case. Recommend reusing it.';
    case 'medium':
      return 'Possible match found. This flag might cover your use case, but you should verify. Consider reusing or creating a new flag.';
    case 'low':
      return 'Weak or no match found. The existing flags don\'t appear to cover your use case. Recommend creating a new flag.';
  }
}

/**
 * Format detection result for output
 */
export function formatDetectionResult(result: DetectionResult): string {
  if (!result.flagFound || !result.candidate) {
    return `
## Flag Detection Result

**Result**: No existing flag found with sufficient confidence.

**Recommendation**: Proceed with creating a new feature flag.

**Reasoning**: After searching Unleash projects, code references (file-based, git history, semantic matching), and nearby context, no existing flags were found that match your use case well enough to reuse.
`.trim();
  }

  const { candidate } = result;
  const confidenceExplanation = getConfidenceExplanation(result.confidenceLevel);

  return `
## Flag Detection Result

**Result**: Existing flag found!

**Flag Name**: \`${candidate.name}\`
**Location**: ${candidate.location}
**Confidence**: ${(candidate.score * 100).toFixed(0)}% (${result.confidenceLevel})
**Detection Method**: ${candidate.detectionMethod}

**Context**:
\`\`\`
${candidate.context}
\`\`\`

**Reasoning**: ${candidate.reasoning}

**Assessment**: ${confidenceExplanation}

**Recommendation**: ${
    result.recommendation === 'use_existing'
      ? `Reuse the existing flag \`${candidate.name}\` instead of creating a new one.`
      : result.recommendation === 'ask_user'
      ? `Review the flag \`${candidate.name}\` to determine if it fits your use case. You can either reuse it or create a new flag if it doesn't match.`
      : 'The confidence is too low. Consider creating a new flag instead.'
  }
`.trim();
}

/**
 * Validate that a detection result has required fields
 */
export function validateDetectionResult(result: unknown): result is DetectionResult {
  if (typeof result !== 'object' || result === null) {
    return false;
  }

  const r = result as Record<string, unknown>;

  if (typeof r.flagFound !== 'boolean') {
    return false;
  }

  if (r.flagFound) {
    if (!r.candidate || typeof r.candidate !== 'object') {
      return false;
    }

    const c = r.candidate as Record<string, unknown>;
    if (
      typeof c.name !== 'string' ||
      typeof c.location !== 'string' ||
      typeof c.context !== 'string' ||
      typeof c.score !== 'number' ||
      typeof c.detectionMethod !== 'string' ||
      typeof c.reasoning !== 'string'
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Create a detection result from candidate
 */
export function createDetectionResult(candidate: FlagCandidate | null): DetectionResult {
  if (!candidate) {
    return {
      flagFound: false,
      candidate: null,
      confidenceLevel: 'low',
      recommendation: 'create_new',
    };
  }

  const confidenceLevel = calculateConfidenceLevel(candidate.score);
  const recommendation = determineRecommendation(confidenceLevel);

  return {
    flagFound: true,
    candidate,
    confidenceLevel,
    recommendation,
  };
}

/**
 * Get scoring guidance for prompt inclusion
 */
export function getScoringGuidance(): string {
  return `
## Scoring Guidance

When scoring flag candidates, use these weights to calculate the final score:

- **Unleash inventory**: ${DETECTION_WEIGHTS['unleash-inventory']} (0.25)
  - Same project with strong name/description alignment: 1.0
  - Related project or partial alignment: 0.7
  - Archived or weakly related flag: 0.4

- **File-based detection**: ${DETECTION_WEIGHTS['file-based']} (0.3)
  - Same file as modification: 0.8
  - Same directory: 0.6
  - Same module/package: 0.4
  - Other location: 0.2

- **Git history detection**: ${DETECTION_WEIGHTS['git-history']} (0.15)
  - Last week: 0.8
  - Last month: 0.6
  - Last 3 months: 0.4
  - Older: 0.2

- **Semantic matching**: ${DETECTION_WEIGHTS['semantic']} (0.2)
  - Exact match: 1.0
  - Contains all words: 0.8
  - Contains some words: 0.6
  - Partial match: 0.4

- **Code context**: ${DETECTION_WEIGHTS['code-context']} (0.1)
  - Directly wraps modification: 1.0
  - Same function: 0.7
  - Same class/module: 0.5
  - Elsewhere in file: 0.3

**Final Score Calculation**:
\`\`\`
final_score = (unleash_score × 0.25)
            + (file_score × 0.30)
            + (git_score × 0.15)
            + (semantic_score × 0.20)
            + (context_score × 0.10)
\`\`\`

**Confidence Levels**:
- **High** (≥${CONFIDENCE_THRESHOLDS.high}): Strong recommendation to reuse
- **Medium** (≥${CONFIDENCE_THRESHOLDS.medium}): Possible match, ask user
- **Low** (<${CONFIDENCE_THRESHOLDS.medium}): Create new flag
`.trim();
}
