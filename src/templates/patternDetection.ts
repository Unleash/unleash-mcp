export interface DetectedPatterns {
  importStyle?: 'esm' | 'commonjs';
  clientName?: string;
  helperMethod?: string;
  hookName?: string;
  quoteChar?: '\'' | '"';
  usesSemicolons?: boolean;
}

/**
 * Detect simple code style patterns from the provided code context.
 * Focuses on the data we can reasonably extract with lightweight heuristics.
 */
export function detectPatterns(
  language: string,
  codeContext?: string
): DetectedPatterns | undefined {
  if (!codeContext || codeContext.trim().length === 0) {
    return undefined;
  }

  const normalizedLanguage = language.toLowerCase();
  const patterns: DetectedPatterns = {};
  const context = codeContext;

  // Detect import style (ESM vs CommonJS)
  if (/\brequire\s*\(/.test(context)) {
    patterns.importStyle = 'commonjs';
  } else if (/\bimport\s+[\w*{}\s,]+\s+from\s+['"]/.test(context)) {
    patterns.importStyle = 'esm';
  }

  // Detect client name and helper method (e.g., unleash.isEnabled)
  const clientMatch = context.match(/\b([A-Za-z_][A-Za-z0-9_]*)\.(isEnabled|is_enabled|isFeatureEnabled)\s*\(/);
  if (clientMatch) {
    patterns.clientName = clientMatch[1];
    patterns.helperMethod = clientMatch[2];
  }

  // Detect hook usage (React style)
  const hookMatch = context.match(/\b(use[A-Z][A-Za-z0-9_]*)\s*\(/);
  if (hookMatch) {
    patterns.hookName = hookMatch[1];
  }

  // Detect quote style preference
  const singleQuotes = (context.match(/'/g) || []).length;
  const doubleQuotes = (context.match(/"/g) || []).length;
  if (singleQuotes > doubleQuotes) {
    patterns.quoteChar = '\'';
  } else if (doubleQuotes > singleQuotes) {
    patterns.quoteChar = '"';
  }

  // Detect semicolon usage (mainly relevant for JS/TS)
  if (['typescript', 'javascript'].includes(normalizedLanguage)) {
    if (/;\s*(?:\n|$)/.test(context)) {
      patterns.usesSemicolons = true;
    } else if (!/;\s*(?:\n|$)/.test(context)) {
      patterns.usesSemicolons = false;
    }
  }

  return Object.keys(patterns).length > 0 ? patterns : undefined;
}
