/**
 * Language Detection and Metadata
 *
 * Detects programming language from file extensions and provides
 * language-specific metadata for code generation.
 */

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'ruby'
  | 'php'
  | 'csharp'
  | 'java'
  | 'rust';

export interface LanguageMetadata {
  language: SupportedLanguage;
  displayName: string;
  fileExtensions: string[];
  unleashSdk: {
    packageName: string;
    docsUrl: string;
  };
  commonMethods: string[];
  commonClientNames: string[];
}

/**
 * Language metadata for all supported languages
 */
export const LANGUAGE_METADATA: Record<SupportedLanguage, LanguageMetadata> = {
  typescript: {
    language: 'typescript',
    displayName: 'TypeScript',
    fileExtensions: ['ts', 'tsx'],
    unleashSdk: {
      packageName: 'unleash-client',
      docsUrl: 'https://docs.getunleash.io/reference/sdks/node',
    },
    commonMethods: ['isEnabled', 'useFlag', 'useFlagEnabled', 'useFeatureFlag'],
    commonClientNames: ['unleash', 'client', 'featureFlags'],
  },
  javascript: {
    language: 'javascript',
    displayName: 'JavaScript',
    fileExtensions: ['js', 'jsx', 'mjs', 'cjs'],
    unleashSdk: {
      packageName: 'unleash-client',
      docsUrl: 'https://docs.getunleash.io/reference/sdks/node',
    },
    commonMethods: ['isEnabled', 'useFlag', 'useFlagEnabled'],
    commonClientNames: ['unleash', 'client', 'featureFlags'],
  },
  python: {
    language: 'python',
    displayName: 'Python',
    fileExtensions: ['py'],
    unleashSdk: {
      packageName: 'UnleashClient',
      docsUrl: 'https://docs.getunleash.io/reference/sdks/python',
    },
    commonMethods: ['is_enabled'],
    commonClientNames: ['unleash_client', 'client', 'unleash'],
  },
  go: {
    language: 'go',
    displayName: 'Go',
    fileExtensions: ['go'],
    unleashSdk: {
      packageName: 'github.com/Unleash/unleash-client-go/v3',
      docsUrl: 'https://docs.getunleash.io/reference/sdks/go',
    },
    commonMethods: ['IsEnabled'],
    commonClientNames: ['unleash'],
  },
  ruby: {
    language: 'ruby',
    displayName: 'Ruby',
    fileExtensions: ['rb'],
    unleashSdk: {
      packageName: 'unleash',
      docsUrl: 'https://docs.getunleash.io/reference/sdks/ruby',
    },
    commonMethods: ['is_enabled?', 'enabled?'],
    commonClientNames: ['unleash', 'client'],
  },
  php: {
    language: 'php',
    displayName: 'PHP',
    fileExtensions: ['php'],
    unleashSdk: {
      packageName: 'unleash/client',
      docsUrl: 'https://docs.getunleash.io/reference/sdks/php',
    },
    commonMethods: ['isEnabled'],
    commonClientNames: ['unleash', 'client'],
  },
  csharp: {
    language: 'csharp',
    displayName: 'C#',
    fileExtensions: ['cs'],
    unleashSdk: {
      packageName: 'Unleash.Client',
      docsUrl: 'https://docs.getunleash.io/reference/sdks/dotnet',
    },
    commonMethods: ['IsEnabled'],
    commonClientNames: ['unleash', 'client'],
  },
  java: {
    language: 'java',
    displayName: 'Java',
    fileExtensions: ['java'],
    unleashSdk: {
      packageName: 'io.getunleash:unleash-client-java',
      docsUrl: 'https://docs.getunleash.io/reference/sdks/java',
    },
    commonMethods: ['isEnabled'],
    commonClientNames: ['unleash', 'client'],
  },
  rust: {
    language: 'rust',
    displayName: 'Rust',
    fileExtensions: ['rs'],
    unleashSdk: {
      packageName: 'unleash-api-client',
      docsUrl: 'https://docs.getunleash.io/reference/sdks/rust',
    },
    commonMethods: ['is_enabled'],
    commonClientNames: ['client'],
  },
};

/**
 * Detect language from file name or explicit language parameter
 */
export function detectLanguage(
  fileName?: string,
  explicitLanguage?: string
): SupportedLanguage {
  // Use explicit language if provided and valid
  if (explicitLanguage && explicitLanguage in LANGUAGE_METADATA) {
    return explicitLanguage as SupportedLanguage;
  }

  // Try to detect from file extension
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext) {
      for (const [lang, metadata] of Object.entries(LANGUAGE_METADATA)) {
        if (metadata.fileExtensions.includes(ext)) {
          return lang as SupportedLanguage;
        }
      }
    }
  }

  // Default to TypeScript if unable to detect
  return 'typescript';
}

/**
 * Get metadata for a specific language
 */
export function getLanguageMetadata(language: SupportedLanguage): LanguageMetadata {
  return LANGUAGE_METADATA[language];
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): SupportedLanguage[] {
  return Object.keys(LANGUAGE_METADATA) as SupportedLanguage[];
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: string): boolean {
  return language in LANGUAGE_METADATA;
}
