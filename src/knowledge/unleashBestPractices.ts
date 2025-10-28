/**
 * Unleash Best Practices Knowledge Base
 *
 * Centralized source of guidance extracted from official Unleash documentation.
 * This knowledge base is used by prompts and tools to provide consistent,
 * authoritative recommendations aligned with Unleash best practices.
 *
 * Primary source: https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale
 */

export interface BestPractice {
  category: string;
  title: string;
  description: string;
  docsUrl?: string;
  examples?: string[];
}

/**
 * Flag Type Selection Guidelines
 *
 * Choose the right flag type to signal intent and expected lifecycle.
 */
export const flagTypes: BestPractice[] = [
  {
    category: 'flag-types',
    title: 'Release Flags',
    description: 'Use for gradual feature rollouts to users. These flags allow you to progressively expose new functionality, starting with internal teams, then beta users, and finally all users. Release flags should have a limited lifetime and be removed after full rollout.',
    docsUrl: 'https://docs.getunleash.io/topics/feature-flags/feature-flag-types#release-toggles',
    examples: [
      'new-checkout-flow: Gradual rollout of redesigned checkout',
      'mobile-app-v2: Progressive deployment of mobile app rewrite',
    ],
  },
  {
    category: 'flag-types',
    title: 'Experiment Flags',
    description: 'Use for A/B tests and experiments where you need to measure impact. These flags are temporary and should be removed once the experiment concludes and a winner is chosen.',
    docsUrl: 'https://docs.getunleash.io/topics/feature-flags/feature-flag-types#experiment-toggles',
    examples: [
      'pricing-page-variant-a: Test different pricing page layouts',
      'recommendation-algorithm-v2: Compare recommendation algorithms',
    ],
  },
  {
    category: 'flag-types',
    title: 'Operational Flags',
    description: 'Use for system behavior and operational concerns. These flags control technical aspects like caching strategies, database connection pooling, or feature degradation under load. They may be long-lived.',
    docsUrl: 'https://docs.getunleash.io/topics/feature-flags/feature-flag-types#ops-toggles',
    examples: [
      'use-redis-cache: Toggle between caching strategies',
      'enable-request-batching: Control batching behavior',
    ],
  },
  {
    category: 'flag-types',
    title: 'Kill Switch Flags',
    description: 'Use for emergency shutdowns or circuit breakers. These flags allow you to quickly disable problematic features in production without deploying code. Should be tested regularly.',
    docsUrl: 'https://docs.getunleash.io/topics/feature-flags/feature-flag-types#kill-switches',
    examples: [
      'disable-email-notifications: Emergency stop for email system',
      'circuit-breaker-payment-provider: Kill switch for payment integration',
    ],
  },
  {
    category: 'flag-types',
    title: 'Permission Flags',
    description: 'Use for role-based access control and entitlements. These flags control who can access specific features based on user attributes, subscription tiers, or permissions.',
    docsUrl: 'https://docs.getunleash.io/topics/feature-flags/feature-flag-types#permission-toggles',
    examples: [
      'premium-analytics-dashboard: Restrict to premium users',
      'admin-user-management: Restrict to admin roles',
    ],
  },
];

/**
 * Flag Lifecycle Management
 *
 * Guidelines for flag creation, maintenance, and cleanup.
 */
export const lifecycle: BestPractice[] = [
  {
    category: 'lifecycle',
    title: 'Limit Flag Lifetime',
    description: 'Feature flags should be temporary by default. Release and experiment flags must have a planned removal date. The longer a flag exists, the more technical debt it creates. Set up reminders or automated checks to remove flags after successful rollout.',
    docsUrl: 'https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale#limit-the-lifespan-of-feature-flags',
    examples: [
      'Add flag removal task to project board after creation',
      'Document expected removal date in flag description',
      'Schedule cleanup sprints to remove old flags',
    ],
  },
  {
    category: 'lifecycle',
    title: 'Clear Ownership',
    description: 'Every flag should have a clear owner who is responsible for its lifecycle. The owner decides when to enable, disable, or remove the flag. Without clear ownership, flags become orphaned and create technical debt.',
    docsUrl: 'https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale#assign-ownership-of-feature-flags',
    examples: [
      'Tag flags with team or owner name',
      'Document owner in flag description',
      'Include owner in flag naming: team-feature-name',
    ],
  },
  {
    category: 'lifecycle',
    title: 'Document Purpose and Context',
    description: 'Flag descriptions should clearly explain what the flag controls, why it exists, what the rollout plan is, and when it should be removed. Good documentation prevents confusion and helps with cleanup.',
    docsUrl: 'https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale',
    examples: [
      'Description: "Controls new checkout flow. Rollout: dev → 10% → 50% → 100%. Remove after Q2 2024."',
      'Include links to related tickets, PRs, or design docs',
    ],
  },
  {
    category: 'lifecycle',
    title: 'Flag Cleanup is Critical',
    description: 'Remove flags after successful rollout to avoid flag sprawl. Each flag adds complexity to your codebase. Schedule regular flag cleanup sessions. Treat flag removal as part of the feature development process, not an afterthought.',
    docsUrl: 'https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale#remove-flags-when-theyre-no-longer-needed',
  },
];

/**
 * Rollout Strategies
 *
 * Recommended approaches for safely rolling out changes.
 */
export const rollout: BestPractice[] = [
  {
    category: 'rollout',
    title: 'Progressive Rollout Sequence',
    description: 'Roll out changes gradually to minimize risk. Start with development/staging environments, then internal users, then a small percentage of production users, gradually increasing to 100%. This allows you to catch issues before they affect all users.',
    docsUrl: 'https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale#use-gradual-rollouts',
    examples: [
      'Phase 1: Enable in dev/staging for testing',
      'Phase 2: Enable for internal team members (dogfooding)',
      'Phase 3: Enable for 1-5% of production users',
      'Phase 4: Gradually increase to 10%, 25%, 50%, 100%',
      'Phase 5: Monitor metrics at each stage before proceeding',
    ],
  },
  {
    category: 'rollout',
    title: 'Environment-Based Enablement',
    description: 'Use environment-based strategies to enable features in non-production environments first. This allows thorough testing before any production exposure.',
    docsUrl: 'https://docs.getunleash.io/reference/activation-strategies#default-strategy',
    examples: [
      'Enable by default in development and staging',
      'Use percentage rollout in production',
      'Use user ID strategy for internal team members',
    ],
  },
  {
    category: 'rollout',
    title: 'Percentage-Based Gradual Rollout',
    description: 'Use percentage-based rollout (canary deployment) in production to expose changes to a small subset of users first. Monitor metrics and error rates before expanding.',
    docsUrl: 'https://docs.getunleash.io/reference/activation-strategies#gradual-rollout',
    examples: [
      'Start at 1% to detect immediate issues',
      'Double percentage after successful monitoring period',
      'Pause or rollback if metrics degrade',
    ],
  },
  {
    category: 'rollout',
    title: 'Monitor and Measure',
    description: 'Always monitor key metrics during rollout. Use impression data to track flag evaluations. Set up alerts for error rates, performance degradation, or unexpected behavior. Be ready to disable the flag if issues arise.',
    docsUrl: 'https://docs.getunleash.io/reference/impression-data',
  },
];

/**
 * Anti-Patterns to Avoid
 *
 * Common mistakes that lead to technical debt and complexity.
 */
export const antiPatterns: BestPractice[] = [
  {
    category: 'anti-patterns',
    title: 'Flag Sprawl',
    description: 'Creating too many flags without cleaning up old ones leads to an unmaintainable codebase. Every flag adds conditional complexity. Reuse existing flags when possible instead of creating new ones for minor variations.',
    docsUrl: 'https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale#avoid-flag-sprawl',
    examples: [
      'Before creating a flag, search for existing related flags',
      'Combine related features under one flag when appropriate',
      'Remove flags immediately after full rollout',
    ],
  },
  {
    category: 'anti-patterns',
    title: 'Nested Flag Checks',
    description: 'Avoid nesting flags inside other flags. If code is already protected by a parent flag, adding another flag creates unnecessary complexity and makes rollout logic hard to reason about.',
    examples: [
      'BAD: if (newCheckout) { if (newPaymentFlow) { ... } }',
      'GOOD: Single flag for the entire feature, or sequential rollout',
    ],
  },
  {
    category: 'anti-patterns',
    title: 'Long-Lived Release Flags',
    description: 'Release flags should be temporary. If a flag has been enabled at 100% for weeks or months, it should be removed. Long-lived flags indicate incomplete work or fear of removing code.',
    examples: [
      'Set removal reminders when creating flags',
      'Schedule cleanup sprints quarterly',
      'Track flag age and alert on old flags',
    ],
  },
  {
    category: 'anti-patterns',
    title: 'Overusing Flags for Simple Changes',
    description: 'Not every change needs a feature flag. Small, low-risk changes (bug fixes, typos, config tweaks, refactors) can be deployed directly. Reserve flags for risky changes, new features, or changes requiring gradual rollout.',
    examples: [
      'Bug fix changing error message: No flag needed',
      'New payment provider integration: Flag needed',
      'Refactoring internal function: No flag needed',
      'New user-facing feature: Flag needed',
    ],
  },
  {
    category: 'anti-patterns',
    title: 'Unclear Flag Names',
    description: 'Flag names like "flag1", "test", or "new-feature" provide no context. Use descriptive names that explain what the flag controls. Good names make the codebase self-documenting.',
    examples: [
      'BAD: "flag1", "test", "new-stuff"',
      'GOOD: "stripe-payment-integration", "redesigned-dashboard", "email-notifications-v2"',
    ],
  },
];

/**
 * Get all best practices organized by category.
 */
export const allBestPractices = {
  flagTypes,
  lifecycle,
  rollout,
  antiPatterns,
};

/**
 * Get a formatted summary of flag type selection criteria.
 * Useful for including in prompt instructions.
 */
export function getFlagTypeGuidance(): string {
  return flagTypes
    .map(
      (practice) =>
        `**${practice.title}**: ${practice.description}\n${practice.examples ? `Examples: ${practice.examples.join(', ')}` : ''}`
    )
    .join('\n\n');
}

/**
 * Get a formatted summary of rollout best practices.
 * Useful for including in evaluation guidance.
 */
export function getRolloutGuidance(): string {
  return rollout
    .map(
      (practice) =>
        `**${practice.title}**: ${practice.description}${practice.docsUrl ? `\nLearn more: ${practice.docsUrl}` : ''}`
    )
    .join('\n\n');
}

/**
 * Get a formatted summary of anti-patterns to avoid.
 * Useful for warning about common mistakes.
 */
export function getAntiPatternWarnings(): string {
  return antiPatterns
    .map(
      (practice) =>
        `⚠️ **${practice.title}**: ${practice.description}`
    )
    .join('\n\n');
}
