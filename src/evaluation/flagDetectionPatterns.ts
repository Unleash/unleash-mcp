/**
 * Parent Flag Detection Patterns
 *
 * Cross-language patterns for detecting existing feature flag checks in code.
 * These patterns help LLMs identify when code is already protected by a parent
 * flag, avoiding unnecessary flag nesting.
 *
 * Design principles:
 * - Language-specific where necessary, but generalizable where possible
 * - Pattern-based: LLM performs the actual matching
 * - Scope-aware: Includes logic for determining flag coverage scope
 * - Explicit examples for few-shot learning
 */

export type ScopeType = 'braces' | 'indentation' | 'guard-clause' | 'ternary' | 'jsx';

export interface FlagPattern {
  language: string[];
  patternType: 'conditional' | 'assignment' | 'hook' | 'guard' | 'wrapper' | 'ternary' | 'jsx';
  description: string;
  regexPatterns: string[];
  scopeRules: {
    type: ScopeType;
    instructions: string;
  };
  examples: Array<{
    code: string;
    explanation: string;
  }>;
}

/**
 * Conditional Statement Patterns
 *
 * Standard if/else blocks that create conditional scopes.
 */
export const conditionalPatterns: FlagPattern[] = [
  {
    language: ['typescript', 'javascript', 'java', 'c#', 'go', 'php'],
    patternType: 'conditional',
    description: 'Standard if statement with flag check',
    regexPatterns: [
      'if\\s*\\(.*\\.isEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)',
      'if\\s*\\(.*unleash\\.isEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)',
      'if\\s*\\(.*client\\.isEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)',
      'if\\s*\\(.*featureFlags?\\.isEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)',
      'if\\s*\\(.*isEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)',
    ],
    scopeRules: {
      type: 'braces',
      instructions: `
1. Find the opening brace { after the if statement
2. Count braces: { adds 1, } subtracts 1
3. When count returns to 0, that's the end of the if block
4. Check if the code insertion point (lineNumber) falls between the if and closing brace
5. If yes, the code is covered by this flag
      `.trim(),
    },
    examples: [
      {
        code: `if (unleash.isEnabled('new-feature')) {
  // Code here at line 2 is covered
  const result = processData();
  return result;
} // Coverage ends here at line 5`,
        explanation: 'Lines 2-4 are covered by the "new-feature" flag',
      },
      {
        code: `if (client.isEnabled('payment-v2')) {
  if (isValidCard()) { // Nested block
    chargeCard();
  }
  sendConfirmation();
}`,
        explanation: 'All code inside, including nested blocks, is covered by "payment-v2"',
      },
    ],
  },
  {
    language: ['python'],
    patternType: 'conditional',
    description: 'Python if statement with flag check',
    regexPatterns: [
      'if\\s+.*\\.is_enabled\\([\'"`]([^\'"`]+)[\'"`]\\)\\s*:',
      'if\\s+.*unleash\\.is_enabled\\([\'"`]([^\'"`]+)[\'"`]\\)\\s*:',
      'if\\s+.*client\\.is_enabled\\([\'"`]([^\'"`]+)[\'"`]\\)\\s*:',
      'if\\s+is_enabled\\([\'"`]([^\'"`]+)[\'"`]\\)\\s*:',
    ],
    scopeRules: {
      type: 'indentation',
      instructions: `
1. Note the indentation level of the if statement line
2. All lines MORE indented than the if statement are inside the block
3. When indentation returns to the original level or less, coverage ends
4. Check if the code insertion point is more indented than the if line
5. If yes, the code is covered by this flag
      `.trim(),
    },
    examples: [
      {
        code: `if client.is_enabled('new-dashboard'):
    # This line (indent 4) is covered
    render_new_dashboard()
    process_metrics()
# This line (indent 0) is NOT covered`,
        explanation: 'Lines with indent > 0 are covered by "new-dashboard"',
      },
    ],
  },
];

/**
 * Variable Assignment Patterns
 *
 * Flags stored in variables that are later checked.
 */
export const assignmentPatterns: FlagPattern[] = [
  {
    language: ['typescript', 'javascript', 'java', 'c#', 'go'],
    patternType: 'assignment',
    description: 'Flag evaluation result stored in variable',
    regexPatterns: [
      '(?:const|let|var)\\s+(\\w+)\\s*=\\s*.*\\.isEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)',
      '(\\w+)\\s*=\\s*.*\\.isEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)',
    ],
    scopeRules: {
      type: 'braces',
      instructions: `
1. Find the variable name from the assignment (e.g., "enabled", "flagActive")
2. Scan DOWNWARD from the assignment for conditional checks using that variable
3. Look for patterns: if (variableName), if (!variableName), if (variableName === true)
4. Apply brace-counting rules to that conditional block
5. If the code insertion point is inside that conditional, it's covered
      `.trim(),
    },
    examples: [
      {
        code: `const enabled = client.isEnabled('new-checkout');
// Code here is NOT yet covered
if (enabled) {
  // Code here IS covered by 'new-checkout'
  processCheckout();
}`,
        explanation: 'Must find both the assignment AND the conditional check',
      },
      {
        code: `let isFeatureEnabled = unleash.isEnabled('beta-ui');
if (!isFeatureEnabled) {
  return oldUI();
}
// Code here IS covered (guard clause pattern)
return newUI();`,
        explanation: 'Guard clause pattern - everything after the guard is covered',
      },
    ],
  },
  {
    language: ['python'],
    patternType: 'assignment',
    description: 'Python flag assignment',
    regexPatterns: [
      '(\\w+)\\s*=\\s*.*\\.is_enabled\\([\'"`]([^\'"`]+)[\'"`]\\)',
    ],
    scopeRules: {
      type: 'indentation',
      instructions: `
1. Find the variable name from the assignment
2. Scan downward for conditionals using that variable: if variableName:
3. Apply indentation rules to that conditional block
      `.trim(),
    },
    examples: [
      {
        code: `enabled = client.is_enabled('new-feature')
if enabled:
    # Code here is covered
    activate_feature()`,
        explanation: 'Assignment followed by conditional check',
      },
    ],
  },
];

/**
 * React Hook Patterns
 *
 * React-specific patterns using hooks.
 */
export const hookPatterns: FlagPattern[] = [
  {
    language: ['typescript', 'javascript', 'tsx', 'jsx'],
    patternType: 'hook',
    description: 'React hooks that return flag state',
    regexPatterns: [
      'const\\s+(\\w+)\\s*=\\s*useFlag\\([\'"`]([^\'"`]+)[\'"`]\\)',
      'const\\s+(\\w+)\\s*=\\s*useFlagEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)',
      'const\\s+(\\w+)\\s*=\\s*useFeatureFlag\\([\'"`]([^\'"`]+)[\'"`]\\)',
      'const\\s+\\{\\s*(\\w+)\\s*\\}\\s*=\\s*useUnleashContext\\(\\)',
      'const\\s+\\{\\s*flags\\s*\\}\\s*=\\s*useFeatureFlags\\(\\)',
    ],
    scopeRules: {
      type: 'jsx',
      instructions: `
1. Find the variable name from the hook (e.g., "enabled", "isEnabled")
2. Look for JSX conditionals using that variable:
   - {variableName && <Component />}
   - {variableName ? <NewUI /> : <OldUI />}
   - {!variableName && <Fallback />}
3. Everything inside the JSX conditional is covered
4. For object destructuring ({flags}), look for: {flags.featureName && ...}
      `.trim(),
    },
    examples: [
      {
        code: `const enabled = useFlag('new-ui');
return (
  <div>
    {enabled && (
      <NewUIComponent />  // This is covered
    )}
  </div>
);`,
        explanation: 'JSX conditional using hook result',
      },
      {
        code: `const { flags } = useFeatureFlags();
return (
  <div>
    {flags.betaFeature ? (
      <BetaUI />  // This is covered by 'betaFeature'
    ) : (
      <StandardUI />
    )}
  </div>
);`,
        explanation: 'Flags object with ternary conditional',
      },
    ],
  },
];

/**
 * Guard Clause Patterns
 *
 * Early returns that protect everything after them.
 */
export const guardPatterns: FlagPattern[] = [
  {
    language: ['typescript', 'javascript', 'java', 'c#', 'go', 'php'],
    patternType: 'guard',
    description: 'Early return guard clause',
    regexPatterns: [
      'if\\s*\\(!.*\\.isEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)\\)\\s*(?:return|throw)',
      'if\\s*\\(!.*isEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)\\)\\s*(?:return|throw)',
    ],
    scopeRules: {
      type: 'guard-clause',
      instructions: `
1. Guard clauses protect everything AFTER them in the same function
2. Find the guard clause line (if (!isEnabled) return;)
3. Find the closing brace of the containing function
4. Everything between the guard and function end is covered
5. If code insertion is after the guard and before function end, it's covered
      `.trim(),
    },
    examples: [
      {
        code: `function processOrder() {
  if (!isEnabled('new-checkout')) {
    return;  // Guard clause at line 2
  }
  // Everything from here to function end is covered
  const order = createOrder();
  validateOrder(order);
  return order;
}`,
        explanation: 'Lines 5-8 are covered by the guard clause',
      },
      {
        code: `async function handlePayment() {
  if (!client.isEnabled('stripe-integration')) {
    throw new Error('Feature disabled');
  }
  // All code after the guard is covered
  return await processStripePayment();
}`,
        explanation: 'Throw statement works the same as return',
      },
    ],
  },
  {
    language: ['python'],
    patternType: 'guard',
    description: 'Python early return guard',
    regexPatterns: [
      'if\\s+not\\s+.*\\.is_enabled\\([\'"`]([^\'"`]+)[\'"`]\\)\\s*:\\s*return',
      'if\\s+not\\s+is_enabled\\([\'"`]([^\'"`]+)[\'"`]\\)\\s*:\\s*return',
    ],
    scopeRules: {
      type: 'guard-clause',
      instructions: `
1. Find the guard clause (if not is_enabled(...): return)
2. Everything after at the same indentation level or more is covered
3. Coverage ends at the function's end (when indent returns to function level)
      `.trim(),
    },
    examples: [
      {
        code: `def process_order():
    if not is_enabled('new-checkout'):
        return
    # Everything from here is covered
    order = create_order()
    return order`,
        explanation: 'Lines 4-6 are covered by the guard',
      },
    ],
  },
];

/**
 * Ternary and Single-Line Patterns
 */
export const ternaryPatterns: FlagPattern[] = [
  {
    language: ['typescript', 'javascript', 'java', 'c#', 'go', 'php'],
    patternType: 'ternary',
    description: 'Ternary operator with flag check',
    regexPatterns: [
      '.*\\.isEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)\\s*\\?',
      'isEnabled\\([\'"`]([^\'"`]+)[\'"`]\\)\\s*\\?',
    ],
    scopeRules: {
      type: 'ternary',
      instructions: `
1. Ternary operators: condition ? whenTrue : whenFalse
2. The "whenTrue" expression is covered by the flag
3. This is typically a single expression/line
4. Not applicable for multi-line code blocks
      `.trim(),
    },
    examples: [
      {
        code: `const result = isEnabled('feature') ? newBehavior() : oldBehavior();`,
        explanation: 'newBehavior() is covered, oldBehavior() is not',
      },
      {
        code: `return enabled ? <NewUI /> : <OldUI />;`,
        explanation: '<NewUI /> is covered',
      },
    ],
  },
];

/**
 * Wrapper Function Patterns
 */
export const wrapperPatterns: FlagPattern[] = [
  {
    language: ['typescript', 'javascript', 'python'],
    patternType: 'wrapper',
    description: 'Wrapper functions and decorators',
    regexPatterns: [
      'withFeatureFlag\\([\'"`]([^\'"`]+)[\'"`]',
      '@FeatureFlag\\([\'"`]([^\'"`]+)[\'"`]\\)',
      'featureToggle\\([\'"`]([^\'"`]+)[\'"`]',
      'when_enabled\\([\'"`]([^\'"`]+)[\'"`]',
    ],
    scopeRules: {
      type: 'braces',
      instructions: `
1. Wrapper functions typically take a callback or lambda
2. Everything inside the callback is covered
3. Look for: withFeatureFlag('name', () => { ... })
4. The function body or lambda body is the covered scope
      `.trim(),
    },
    examples: [
      {
        code: `withFeatureFlag('beta-ui', () => {
  // Everything in this callback is covered
  renderBetaUI();
  trackAnalytics();
});`,
        explanation: 'Callback contents are covered',
      },
      {
        code: `@FeatureFlag('admin-panel')
class AdminController {
  // Entire class is covered by decorator
}`,
        explanation: 'Decorator pattern covers decorated entity',
      },
    ],
  },
];

/**
 * All flag detection patterns organized by type.
 */
export const allFlagPatterns = {
  conditionals: conditionalPatterns,
  assignments: assignmentPatterns,
  hooks: hookPatterns,
  guards: guardPatterns,
  ternary: ternaryPatterns,
  wrappers: wrapperPatterns,
};

/**
 * Get a formatted summary of all flag detection patterns for prompt inclusion.
 */
export function getFlagDetectionGuidance(): string {
  const sections = [
    {
      title: '1. Conditional Statements (if/else)',
      patterns: conditionalPatterns,
      description: 'Standard if blocks that create conditional scopes',
    },
    {
      title: '2. Variable Assignments',
      patterns: assignmentPatterns,
      description: 'Flags stored in variables, checked later',
    },
    {
      title: '3. React Hooks',
      patterns: hookPatterns,
      description: 'React-specific hook patterns',
    },
    {
      title: '4. Guard Clauses',
      patterns: guardPatterns,
      description: 'Early returns that protect code after them',
    },
    {
      title: '5. Ternary Operators',
      patterns: ternaryPatterns,
      description: 'Single-line conditional expressions',
    },
    {
      title: '6. Wrapper Functions/Decorators',
      patterns: wrapperPatterns,
      description: 'Higher-order functions and decorators',
    },
  ];

  return sections
    .map(
      (section) =>
        `### ${section.title}
*${section.description}*

${section.patterns
  .map(
    (p) =>
      `**Languages**: ${p.language.join(', ')}

**Pattern**: ${p.description}

**Regex Patterns**:
${p.regexPatterns.map((r) => `- \`${r}\``).join('\n')}

**Scope Detection**:
${p.scopeRules.instructions}

**Examples**:
${p.examples.map((ex) => `\`\`\`\n${ex.code}\n\`\`\`\n*${ex.explanation}*`).join('\n\n')}
`
  )
  .join('\n---\n\n')}`
    )
    .join('\n\n');
}

/**
 * Get a simplified pattern list for quick reference.
 */
export function getQuickPatternReference(): string {
  const allPatterns = [
    ...conditionalPatterns,
    ...assignmentPatterns,
    ...hookPatterns,
    ...guardPatterns,
    ...ternaryPatterns,
    ...wrapperPatterns,
  ];

  return allPatterns
    .flatMap((p) => p.regexPatterns.map((r) => `- ${p.patternType}: \`${r}\``))
    .join('\n');
}
