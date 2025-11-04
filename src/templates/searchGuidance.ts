/**
 * Search Guidance Generator
 *
 * Generates instructions for LLMs to search codebases for existing
 * feature flag patterns and match detected conventions.
 */

import { SupportedLanguage, getLanguageMetadata, LanguageMetadata } from './languages.js';
import {
  conditionalPatterns,
  assignmentPatterns,
  hookPatterns,
  guardPatterns,
  ternaryPatterns,
  wrapperPatterns,
  FlagPattern,
} from '../evaluation/flagDetectionPatterns.js';
import {
  getDefaultTemplate,
  getTemplateByPattern,
  getTemplatesForLanguage,
} from './wrapperTemplates.js';

/**
 * Generate search instructions for finding existing flag patterns
 */
export function generateSearchInstructions(
  language: SupportedLanguage,
  flagName: string
): string {
  const metadata = getLanguageMetadata(language);
  const relevantPatterns = getRelevantPatterns(language);

  return `# How to Search for Existing Flag Patterns

## Your Task
Before wrapping code with the flag "${flagName}", you MUST search the codebase to find existing feature flag patterns and match them.

## Step 1: Search for Existing Flag Usage

Use the **Grep** tool to search for existing flag patterns in the codebase.

### Search Patterns for ${metadata.displayName}:

${generateGrepCommands(metadata)}

---

## Step 2: Analyze the Search Results

Look for these key patterns in your search results:

### A. Import Patterns
**What to look for:**
- How is the Unleash client imported?
- What file path is used?
- Is it a named import, default import, or destructured?

**Examples you might find:**
${generateImportExamples(language)}

**Action:** Copy the exact import statement you find. You'll use this same import.

---

### B. Client Variable Name
**What to look for:**
- What is the object/variable name used to call the flag check?

**Examples:**
${generateClientExamples(metadata)}

**Action:** Note the client variable name. Use the same one.

---

### C. Method Name
**What to look for:**
- What method/function is called to check the flag?

**Examples:**
${generateMethodExamples(metadata)}

**Action:** Use the exact method name you find.

---

### D. Wrapping Style
**What to look for:**
- How is the flag check structured in existing code?

**Common patterns for ${metadata.displayName}:**

${generateWrappingStyleExamples(language)}

**Action:** Use the same wrapping style you see most often in your search results.

---

## Step 3: Read Full Context from Best Match

Once you find a good example, use the **Read** tool to see the full file:

\`\`\`
Read file_path: "/path/to/file/from/grep/results"
\`\`\`

This lets you see:
- The full import statement (usually at top of file)
- How the flag check is indented
- What happens when the flag is disabled (else block?)
- How errors are handled

---

## Step 4: Match the Pattern When Wrapping

When wrapping your code with "${flagName}":

1. **Use the EXACT import** you found
2. **Use the EXACT client variable name** you found
3. **Use the EXACT method name** you found
4. **Use the SAME wrapping style** you found
5. **Match the indentation** of surrounding code
6. **Use the exact flag name**: \`${flagName}\`

---

## If No Patterns Found

If your Grep searches return no results, use the language defaults shown in the wrapping instructions.

---

## Pattern Detection Details

${generatePatternDetails(relevantPatterns)}

---

## Important Notes

- **Always search first** - Don't assume patterns
- **Match exactly** - Use the same style the codebase already has
- **Read full files** - Grep gives snippets, Read gives context
- **Multiple searches** - Try different patterns if first search fails
- **Preserve style** - Match indentation, spacing, and conventions
`;
}

/**
 * Generate wrapping instructions based on detected or default patterns
 */
export function generateWrappingInstructions(
  language: SupportedLanguage,
  flagName: string
): string {
  const metadata = getLanguageMetadata(language);

  return `# How to Wrap Code with Feature Flag

## ⚠️ CRITICAL: Runtime Controllability

**Feature flags MUST be runtime controllable** - meaning you can toggle them without redeploying your application.

### ✅ DO THIS (Runtime Controllable):
Place the flag check INSIDE the execution path (handler, function, scheduled job):

${generateRuntimeControllableExample(language, flagName)}

### ❌ NEVER DO THIS (Not Runtime Controllable):
DO NOT wrap registrations, mounting, or scheduling - these happen at startup:

${generateNonRuntimeControllableAntiPatterns(language, flagName)}

**Why this matters:**
- ✅ Runtime controllable: Toggle flag → immediate effect
- ❌ Not runtime controllable: Toggle flag → requires redeploy

---

## After Searching (see search instructions)

### Wrapping Template

Based on the patterns you found, wrap your code like this:

**For if-block style:**
${generateIfBlockExample(language, flagName)}

**For guard clause style (handlers/functions):**
${generateGuardExample(language, flagName)}

${generateFrameworkSpecificExamples(language, flagName)}

### Placeholder Replacements:
- \`CLIENT_VAR\` = The client variable name you found (e.g., "unleash", "client")
- \`METHOD_NAME\` = The method name you found (e.g., "isEnabled", "is_enabled")
- \`HOOK_NAME\` = The hook name if using React (e.g., "useFlag", "useFlagEnabled")
- \`ERROR_RESPONSE\` = What to return when disabled (copy from examples)

---

## Language-Specific Defaults

If you found NO existing patterns, use these defaults:

### Default Import:
\`\`\`${getCodeFence(language)}
${getDefaultImport(language)}
\`\`\`

### Default Usage:
\`\`\`${getCodeFence(language)}
${getDefaultUsage(language, flagName)}
\`\`\`

---

## Final Checklist

Before you finish:
- [ ] ✅ **Flag check is RUNTIME CONTROLLABLE** (inside handler/function, NOT wrapping registration)
- [ ] Added import statement at top of file (if not present)
- [ ] Used exact flag name: \`${flagName}\`
- [ ] Matched existing code style (if found)
- [ ] Matched indentation
- [ ] Tested that code compiles/runs
- [ ] Considered what happens when flag is disabled

---

## SDK Documentation

For more information, see the official Unleash SDK documentation:
${metadata.unleashSdk.docsUrl}
`;
}

/**
 * Get relevant patterns for a specific language
 */
function getRelevantPatterns(language: SupportedLanguage) {
  const allPatterns = [
    ...conditionalPatterns,
    ...assignmentPatterns,
    ...hookPatterns,
    ...guardPatterns,
    ...ternaryPatterns,
    ...wrapperPatterns,
  ];

  return allPatterns.filter(p => p.language.includes(language));
}

/**
 * Generate Grep commands for a language
 */
function generateGrepCommands(metadata: LanguageMetadata): string {
  const methods = metadata.commonMethods;
  const examples = methods.map(
    (method: string) =>
      `\`\`\`bash
Grep pattern: "${method}" output_mode: "content" -n: true head_limit: 5
\`\`\``
  );

  return `Search for these patterns (try each one):
${methods.map((m: string) => `- \`${m}\` - Common flag check method`).join('\n')}

**Example Grep commands:**
${examples.join('\n')}`;
}

/**
 * Generate import examples for a language
 */
function generateImportExamples(language: SupportedLanguage): string {
  const templates = getTemplatesForLanguage(language, 'placeholder');
  const uniqueImports = [...new Set(templates.map(t => t.import))];
  const codeFence = getCodeFence(language);

  return `\`\`\`${codeFence}\n${uniqueImports.join('\n')}\n\`\`\``;
}

/**
 * Generate client variable examples
 */
function generateClientExamples(metadata: LanguageMetadata): string {
  const examples = metadata.commonClientNames.map((name: string) => {
    const method = metadata.commonMethods[0];
    return `- \`${name}.${method}('flag')\` → client variable is "${name}"`;
  });

  return examples.join('\n');
}

/**
 * Generate method examples
 */
function generateMethodExamples(metadata: LanguageMetadata): string {
  return metadata.commonMethods
    .map((method: string) => `- \`${method}\` (${metadata.displayName})`)
    .join('\n');
}

/**
 * Generate wrapping style examples for a language
 */
function generateWrappingStyleExamples(language: SupportedLanguage): string {
  const templates = getTemplatesForLanguage(language, 'example-flag');
  return templates
    .slice(0, 3) // First 3 patterns
    .map(
      (t, i) => `
**${i + 1}. ${t.explanation}:**
\`\`\`${getCodeFence(language)}
${t.usage}
\`\`\`
*${t.pattern} pattern${t.framework ? ` for ${t.framework}` : ''}*
`
    )
    .join('\n');
}

/**
 * Generate pattern details for documentation
 */
function generatePatternDetails(patterns: FlagPattern[]): string {
  return patterns
    .map(
      p => `
### ${p.description}
**Pattern Type:** ${p.patternType}

**Regex Patterns:**
${p.regexPatterns.map((r: string) => `- \`${r}\``).join('\n')}

**Scope Detection:**
${p.scopeRules.instructions}
`
    )
    .join('\n---\n');
}

/**
 * Generate if-block example
 */
function generateIfBlockExample(language: SupportedLanguage, flagName: string): string {
  const template = getTemplateByPattern(language, flagName, 'if-block');
  if (!template) {
    return '';
  }
  return `\`\`\`${getCodeFence(language)}\n${template.usage}\n\`\`\``;
}

/**
 * Generate guard clause example
 */
function generateGuardExample(language: SupportedLanguage, flagName: string): string {
  const template = getTemplateByPattern(language, flagName, 'guard');
  if (!template) {
    return generateIfBlockExample(language, flagName);
  }
  return `\`\`\`${getCodeFence(language)}\n${template.usage}\n\`\`\``;
}

/**
 * Generate framework-specific examples
 */
function generateFrameworkSpecificExamples(language: SupportedLanguage, flagName: string): string {
  const hookTemplate = getTemplateByPattern(language, flagName, 'hook');
  if (hookTemplate) {
    return `
**For React components (hook pattern):**
\`\`\`${getCodeFence(language)}
${hookTemplate.usage}
\`\`\``;
  }

  return '';
}

/**
 * Get default import for a language
 */
function getDefaultImport(language: SupportedLanguage): string {
  const template = getDefaultTemplate(language, 'placeholder');
  return template.import;
}

/**
 * Get default usage for a language
 */
function getDefaultUsage(language: SupportedLanguage, flagName: string): string {
  const template = getDefaultTemplate(language, flagName);
  return template.usage;
}

/**
 * Generate runtime controllable example
 */
function generateRuntimeControllableExample(language: SupportedLanguage, flagName: string): string {
  const examples: Record<SupportedLanguage, string> = {
    typescript: `\`\`\`typescript
// ✅ Flag check inside handler - runtime controllable
app.post('/api/checkout', async (req, res) => {
  if (!unleash.isEnabled('${flagName}')) {
    return res.status(404).json({ error: 'Feature not available' });
  }
  // New checkout logic here
});

// ✅ Flag check inside scheduled function - runtime controllable
cron.schedule('0 0 * * *', () => {
  if (!unleash.isEnabled('${flagName}')) return;
  // Scheduled job logic here
});
\`\`\``,
    javascript: `\`\`\`javascript
// ✅ Flag check inside handler - runtime controllable
app.post('/api/checkout', async (req, res) => {
  if (!unleash.isEnabled('${flagName}')) {
    return res.status(404).json({ error: 'Feature not available' });
  }
  // New checkout logic here
});
\`\`\``,
    python: `\`\`\`python
# ✅ Flag check inside view/handler - runtime controllable
@app.route('/api/checkout', methods=['POST'])
def checkout():
    if not unleash_client.is_enabled("${flagName}"):
        return {"error": "Feature not available"}, 404
    # New checkout logic here

# ✅ Flag check inside scheduled function - runtime controllable
@scheduler.task('cron', hour=0)
def scheduled_job():
    if not unleash_client.is_enabled("${flagName}"):
        return
    # Scheduled job logic here
\`\`\``,
    go: `\`\`\`go
// ✅ Flag check inside handler - runtime controllable
func Handler(w http.ResponseWriter, r *http.Request) {
    if !unleash.IsEnabled("${flagName}") {
        http.Error(w, "Feature not available", http.StatusNotFound)
        return
    }
    // New handler logic here
}
\`\`\``,
    ruby: `\`\`\`ruby
# ✅ Flag check inside controller action - runtime controllable
def checkout
  unless UNLEASH.is_enabled?('${flagName}')
    render json: { error: 'Feature not available' }, status: :not_found
    return
  end
  # New checkout logic here
end
\`\`\``,
    php: `\`\`\`php
// ✅ Flag check inside controller method - runtime controllable
public function checkout(Request $request) {
    if (!$unleash->isEnabled('${flagName}')) {
        return response()->json(['error' => 'Feature not available'], 404);
    }
    // New checkout logic here
}
\`\`\``,
    csharp: `\`\`\`csharp
// ✅ Flag check inside controller action - runtime controllable
[HttpPost]
public IActionResult Checkout()
{
    if (!_unleash.IsEnabled("${flagName}"))
    {
        return NotFound(new { error = "Feature not available" });
    }
    // New checkout logic here
}
\`\`\``,
    java: `\`\`\`java
// ✅ Flag check inside controller method - runtime controllable
@PostMapping("/api/checkout")
public ResponseEntity<?> checkout() {
    if (!unleash.isEnabled("${flagName}")) {
        return ResponseEntity.status(404)
            .body(Map.of("error", "Feature not available"));
    }
    // New checkout logic here
}
\`\`\``,
    rust: `\`\`\`rust
// ✅ Flag check inside handler - runtime controllable
async fn handler(client: web::Data<Client>) -> Result<HttpResponse> {
    if !client.is_enabled("${flagName}", None, false) {
        return Ok(HttpResponse::NotFound()
            .json(json!({"error": "Feature not available"})));
    }
    // New handler logic here
}
\`\`\``,
  };
  return examples[language];
}

/**
 * Generate non-runtime controllable anti-patterns
 */
function generateNonRuntimeControllableAntiPatterns(language: SupportedLanguage, flagName: string): string {
  const antiPatterns: Record<SupportedLanguage, string> = {
    typescript: `\`\`\`typescript
// ❌ WRONG: Wrapping route registration - NOT runtime controllable
if (unleash.isEnabled('${flagName}')) {
  app.post('/api/checkout', checkoutHandler);  // Only registered at startup!
}

// ❌ WRONG: Wrapping middleware registration - NOT runtime controllable
if (unleash.isEnabled('${flagName}')) {
  app.use(newMiddleware);  // Only applied at startup!
}

// ❌ WRONG: Wrapping cron scheduling - NOT runtime controllable
if (unleash.isEnabled('${flagName}')) {
  cron.schedule('0 0 * * *', cleanupJob);  // Only scheduled at startup!
}
\`\`\``,
    javascript: `\`\`\`javascript
// ❌ WRONG: Wrapping route registration - NOT runtime controllable
if (unleash.isEnabled('${flagName}')) {
  app.post('/api/checkout', checkoutHandler);  // Only registered at startup!
}
\`\`\``,
    python: `\`\`\`python
# ❌ WRONG: Wrapping route registration - NOT runtime controllable
if unleash_client.is_enabled("${flagName}"):
    @app.route('/api/checkout', methods=['POST'])
    def checkout():
        pass  # Only registered at startup!

# ❌ WRONG: Wrapping decorator application - NOT runtime controllable
if unleash_client.is_enabled("${flagName}"):
    @scheduler.task('cron', hour=0)
    def scheduled_job():
        pass  # Only scheduled at startup!
\`\`\``,
    go: `\`\`\`go
// ❌ WRONG: Wrapping route registration - NOT runtime controllable
if unleash.IsEnabled("${flagName}") {
    http.HandleFunc("/api/checkout", Handler)  // Only registered at startup!
}

// ❌ WRONG: Wrapping middleware registration - NOT runtime controllable
if unleash.IsEnabled("${flagName}") {
    router.Use(NewMiddleware())  // Only applied at startup!
}
\`\`\``,
    ruby: `\`\`\`ruby
# ❌ WRONG: Wrapping route registration - NOT runtime controllable
if UNLEASH.is_enabled?('${flagName}')
  post '/api/checkout', to: 'checkout#create'  # Only registered at startup!
end
\`\`\``,
    php: `\`\`\`php
// ❌ WRONG: Wrapping route registration - NOT runtime controllable
if ($unleash->isEnabled('${flagName}')) {
    Route::post('/api/checkout', [CheckoutController::class, 'create']);  // Only registered at startup!
}
\`\`\``,
    csharp: `\`\`\`csharp
// ❌ WRONG: Wrapping route registration - NOT runtime controllable
if (_unleash.IsEnabled("${flagName}"))
{
    app.MapPost("/api/checkout", Handler);  // Only registered at startup!
}
\`\`\``,
    java: `\`\`\`java
// ❌ WRONG: Wrapping in configuration - NOT runtime controllable
// DO NOT wrap @RequestMapping or route configuration with flags
\`\`\``,
    rust: `\`\`\`rust
// ❌ WRONG: Wrapping route registration - NOT runtime controllable
if client.is_enabled("${flagName}", None, false) {
    app.route("/api/checkout", web::post().to(handler))  // Only registered at startup!
}
\`\`\``,
  };
  return antiPatterns[language];
}

/**
 * Get code fence language identifier
 */
function getCodeFence(language: SupportedLanguage): string {
  const fenceMap: Record<SupportedLanguage, string> = {
    typescript: 'typescript',
    javascript: 'javascript',
    python: 'python',
    go: 'go',
    ruby: 'ruby',
    php: 'php',
    csharp: 'csharp',
    java: 'java',
    rust: 'rust',
  };
  return fenceMap[language];
}
