/**
 * Risk Assessment Patterns
 *
 * Language-agnostic patterns for identifying risky code changes that warrant
 * feature flags. These patterns are used by the evaluate_change prompt to
 * guide LLMs in making risk assessments.
 *
 * Design principles:
 * - Language agnostic: Use keywords and concepts that apply across languages
 * - Pattern-based: LLM does the heavy lifting of pattern matching
 * - Explicit: Clear examples for each pattern
 * - Extensible: Easy to add new patterns as needed
 */

export interface RiskPattern {
  category: 'critical' | 'high' | 'medium' | 'low' | 'excluded';
  keywords: string[];
  filePatterns?: string[];
  codePatterns?: string[];
  description: string;
  reasoning: string;
  examples: string[];
}

/**
 * Critical Risk Patterns
 *
 * Changes that absolutely require feature flags due to potential for
 * catastrophic failure or security issues.
 */
export const criticalRiskPatterns: RiskPattern[] = [
  {
    category: 'critical',
    keywords: [
      'auth',
      'authentication',
      'authorization',
      'login',
      'logout',
      'session',
      'jwt',
      'token',
      'oauth',
      'saml',
      'password',
      'credential',
    ],
    codePatterns: [
      'passport.authenticate',
      'bcrypt',
      'sign(payload',
      'verify(token',
      'authenticate(',
      'authorize(',
    ],
    description: 'Authentication and authorization changes',
    reasoning: 'Auth failures can lock users out, cause security breaches, or expose sensitive data. Must be rolled out carefully.',
    examples: [
      'Implementing OAuth login',
      'Changing session management',
      'Updating password hashing algorithm',
      'Modifying JWT token generation',
    ],
  },
  {
    category: 'critical',
    keywords: [
      'payment',
      'stripe',
      'paypal',
      'billing',
      'charge',
      'refund',
      'invoice',
      'subscription',
      'card',
      'checkout',
    ],
    codePatterns: [
      'stripe.charges',
      'createPaymentIntent',
      'processPayment',
      'chargeCustomer',
    ],
    description: 'Payment processing and billing changes',
    reasoning: 'Payment bugs can cause financial loss, duplicate charges, or failed transactions. Extremely high risk.',
    examples: [
      'Integrating new payment provider',
      'Changing payment flow',
      'Updating pricing calculations',
      'Implementing refund logic',
    ],
  },
  {
    category: 'critical',
    keywords: [
      'security',
      'encrypt',
      'decrypt',
      'hash',
      'crypto',
      'xss',
      'csrf',
      'sql injection',
      'sanitize',
      'escape',
    ],
    codePatterns: [
      'crypto.createCipher',
      'sanitize(',
      'escape(',
      'exec(',
      'eval(',
    ],
    description: 'Security-sensitive operations',
    reasoning: 'Security changes can introduce vulnerabilities, data exposure, or bypass protections. Must be tested thoroughly.',
    examples: [
      'Implementing data encryption',
      'Adding input sanitization',
      'Changing XSS protection',
      'Updating CSRF token handling',
    ],
  },
  {
    category: 'critical',
    keywords: [
      'database',
      'sql',
      'DELETE FROM',
      'DROP TABLE',
      'DROP DATABASE',
      'TRUNCATE',
      'ALTER TABLE',
      'migration',
      'schema',
    ],
    codePatterns: [
      'db.execute("DELETE',
      'DROP TABLE',
      'ALTER TABLE',
      'TRUNCATE',
      '.delete(',
      '.drop(',
    ],
    description: 'Database schema changes and destructive operations',
    reasoning: 'Database changes can cause data loss, corruption, or application crashes. Require careful migration strategy.',
    examples: [
      'Adding/removing database columns',
      'Changing table schemas',
      'Implementing bulk delete operations',
      'Modifying database constraints',
    ],
  },
];

/**
 * High Risk Patterns
 *
 * Changes that pose significant risk and benefit from gradual rollout.
 */
export const highRiskPatterns: RiskPattern[] = [
  {
    category: 'high',
    keywords: [
      'API',
      'endpoint',
      'route',
      'REST',
      'GraphQL',
      'webhook',
      'integration',
    ],
    codePatterns: [
      'app.post(',
      'app.get(',
      'app.put(',
      'app.delete(',
      '@app.route',
      'router.post',
      'router.get',
    ],
    filePatterns: ['**/routes/**', '**/api/**', '**/controllers/**'],
    description: 'API endpoint changes or new integrations',
    reasoning: 'API changes affect external consumers and integrations. Breaking changes can impact multiple systems.',
    examples: [
      'Adding new REST endpoint',
      'Modifying existing API response format',
      'Changing API authentication',
      'Integrating with external service',
    ],
  },
  {
    category: 'high',
    keywords: [
      'external',
      'third-party',
      'fetch(',
      'axios',
      'http.get',
      'http.post',
      'requests.get',
      'requests.post',
    ],
    codePatterns: [
      'fetch(',
      'axios.get',
      'axios.post',
      'http.request',
      'requests.get(',
    ],
    description: 'External service integrations and API calls',
    reasoning: 'External service failures can cascade. Timeouts, rate limits, or API changes can break functionality.',
    examples: [
      'Integrating with new email service',
      'Calling third-party analytics API',
      'Adding payment gateway integration',
      'Connecting to external data source',
    ],
  },
  {
    category: 'high',
    keywords: ['class ', 'new class', 'extends', 'implements'],
    codePatterns: [
      'class ',
      'extends ',
      'implements ',
    ],
    description: 'New class or significant architecture changes',
    reasoning: 'New classes often represent significant features or architectural changes that need gradual rollout.',
    examples: [
      'Adding new service class',
      'Creating new domain model',
      'Implementing new design pattern',
    ],
  },
  {
    category: 'high',
    keywords: [],
    description: 'Large code changes (>100 lines)',
    reasoning: 'Large changes have higher probability of bugs. Benefit from gradual rollout to detect issues early.',
    examples: [
      'Major refactor affecting multiple modules',
      'Complete rewrite of a feature',
      'Large algorithm implementation',
    ],
  },
];

/**
 * Medium Risk Patterns
 *
 * Changes that have some risk but may not require flags depending on context.
 */
export const mediumRiskPatterns: RiskPattern[] = [
  {
    category: 'medium',
    keywords: [
      'async',
      'await',
      'Promise',
      'setTimeout',
      'setInterval',
      'callback',
    ],
    codePatterns: [
      'async function',
      'async (',
      'await ',
      'new Promise',
      '.then(',
      '.catch(',
    ],
    description: 'Asynchronous operations and async/await',
    reasoning: 'Async code can introduce race conditions, timing issues, or error handling complexity.',
    examples: [
      'Converting sync code to async',
      'Adding new async API calls',
      'Implementing background jobs',
    ],
  },
  {
    category: 'medium',
    keywords: [
      'state',
      'redux',
      'vuex',
      'useState',
      'useReducer',
      'store',
    ],
    codePatterns: [
      'useState(',
      'useReducer(',
      'createStore(',
      'Redux.createStore',
    ],
    description: 'State management changes',
    reasoning: 'State changes can affect application behavior across components. May introduce subtle bugs.',
    examples: [
      'Adding new global state',
      'Modifying Redux reducers',
      'Changing state management pattern',
    ],
  },
  {
    category: 'medium',
    keywords: [],
    description: 'Medium-sized changes (50-100 lines)',
    reasoning: 'Medium changes have moderate risk. May benefit from flags depending on code area.',
    examples: [
      'Adding new feature component',
      'Implementing new business logic',
      'Refactoring module structure',
    ],
  },
];

/**
 * Low Risk Patterns
 *
 * Changes that typically don't need feature flags.
 */
export const lowRiskPatterns: RiskPattern[] = [
  {
    category: 'low',
    keywords: [
      'fix',
      'bug',
      'issue',
      'error',
      'problem',
      'patch',
      'correct',
      'typo',
    ],
    description: 'Bug fixes and corrections',
    reasoning: 'Small bug fixes that don\'t change core logic typically don\'t need flags. Exception: critical system bugs.',
    examples: [
      'Fixing typo in error message',
      'Correcting validation logic',
      'Patching edge case bug',
    ],
  },
  {
    category: 'low',
    keywords: [
      'refactor',
      'cleanup',
      'reorganize',
      'improve',
      'optimize',
      'simplify',
    ],
    description: 'Code refactoring without behavior changes',
    reasoning: 'Refactors that don\'t change external behavior are low risk. Should have test coverage.',
    examples: [
      'Extracting helper function',
      'Renaming variables',
      'Reorganizing file structure',
      'Removing dead code',
    ],
  },
  {
    category: 'low',
    keywords: [],
    description: 'Small changes (<20 lines)',
    reasoning: 'Small, focused changes are easier to review and have lower bug probability.',
    examples: [
      'Adding logging statement',
      'Updating text content',
      'Adjusting styling',
    ],
  },
];

/**
 * Excluded Patterns
 *
 * File patterns that should be excluded from flag consideration.
 */
export const excludedPatterns: RiskPattern[] = [
  {
    category: 'excluded',
    keywords: [],
    filePatterns: [
      '**/*.test.ts',
      '**/*.test.js',
      '**/*.spec.ts',
      '**/*.spec.js',
      '**/__tests__/**',
      '**/*.test.tsx',
      '**/*.test.jsx',
      'test_*.py',
      '*_test.py',
      '*_test.go',
      '**/*_test.go',
      '**/*.test.java',
    ],
    description: 'Test files',
    reasoning: 'Test code doesn\'t run in production and doesn\'t need feature flags.',
    examples: [
      'unit tests',
      'integration tests',
      'e2e tests',
    ],
  },
  {
    category: 'excluded',
    keywords: [],
    filePatterns: [
      '**/*.config.ts',
      '**/*.config.js',
      '**/config/**',
      '**/.env',
      '**/.env.*',
      '**/*.yaml',
      '**/*.yml',
      '**/*.json',
      '**/settings.py',
    ],
    description: 'Configuration files',
    reasoning: 'Config files typically contain static values that don\'t need flags.',
    examples: [
      'webpack.config.js',
      'tsconfig.json',
      '.env files',
      'settings.py',
    ],
  },
  {
    category: 'excluded',
    keywords: [],
    filePatterns: [
      '**/*.md',
      '**/*.mdx',
      '**/docs/**',
      '**/documentation/**',
      'README.md',
      'CHANGELOG.md',
    ],
    description: 'Documentation files',
    reasoning: 'Documentation changes don\'t affect runtime behavior.',
    examples: [
      'README updates',
      'API documentation',
      'Code comments',
    ],
  },
];

/**
 * Calculate risk score based on matched patterns.
 *
 * Scoring system:
 * - Critical pattern match: +5 points
 * - High pattern match: +3 points
 * - Medium pattern match: +2 points
 * - Low pattern match: +1 point
 * - Large code size (>100 lines): +2 points
 * - Medium code size (50-100 lines): +1 point
 *
 * Risk levels:
 * - Critical: Score >= 5
 * - High: Score >= 3
 * - Medium: Score >= 2
 * - Low: Score < 2
 */
export function calculateRiskLevel(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 5) return 'critical';
  if (score >= 3) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

/**
 * Get all risk patterns organized by category.
 */
export const allRiskPatterns = {
  critical: criticalRiskPatterns,
  high: highRiskPatterns,
  medium: mediumRiskPatterns,
  low: lowRiskPatterns,
  excluded: excludedPatterns,
};

/**
 * Get a formatted summary of risk patterns for prompt inclusion.
 */
export function getRiskPatternGuidance(): string {
  const sections = [
    {
      title: '🔴 CRITICAL RISK - Flag Required',
      patterns: criticalRiskPatterns,
      weight: '+5 points each',
    },
    {
      title: '🟠 HIGH RISK - Flag Recommended',
      patterns: highRiskPatterns,
      weight: '+3 points each',
    },
    {
      title: '🟡 MEDIUM RISK - Consider Flag',
      patterns: mediumRiskPatterns,
      weight: '+2 points each',
    },
    {
      title: '🟢 LOW RISK - Flag Usually Not Needed',
      patterns: lowRiskPatterns,
      weight: '+1 point each',
    },
  ];

  return sections
    .map(
      (section) =>
        `### ${section.title}\n*Risk weight: ${section.weight}*\n\n${section.patterns
          .map(
            (p) =>
              `**${p.description}**\n- Keywords: ${p.keywords.length > 0 ? p.keywords.join(', ') : 'N/A'}\n- Reasoning: ${p.reasoning}\n- Examples: ${p.examples.join('; ')}`
          )
          .join('\n\n')}`
    )
    .join('\n\n---\n\n');
}
