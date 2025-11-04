/**
 * Wrapper Templates for Feature Flag Code Generation
 *
 * Provides default code templates for wrapping changes with feature flags
 * across multiple programming languages and frameworks.
 */

import { SupportedLanguage } from './languages.js';

export interface CodeTemplate {
  language: SupportedLanguage;
  pattern: 'if-block' | 'guard' | 'hook' | 'decorator' | 'ternary' | 'middleware';
  framework?: string;
  import: string;
  usage: string;
  explanation: string;
}

/**
 * TypeScript/JavaScript Templates
 */
const typescriptTemplates = (flagName: string): CodeTemplate[] => [
  {
    language: 'typescript',
    pattern: 'if-block',
    import: "import { unleash } from './unleash-client';",
    usage: `if (unleash.isEnabled('${flagName}')) {
  // Your new feature code here
}`,
    explanation: 'Standard if-block pattern for conditional feature execution',
  },
  {
    language: 'typescript',
    pattern: 'guard',
    framework: 'Express/Node',
    import: "import { unleash } from './unleash-client';",
    usage: `// ✅ Runtime controllable: Flag checked on every request
async function handler(req: Request, res: Response) {
  if (!unleash.isEnabled('${flagName}')) {
    return res.status(404).json({ error: 'Feature not available' });
  }

  // Your handler code here
}`,
    explanation: 'Runtime-controllable guard clause - checks flag on every request (NOT wrapping route registration)',
  },
  {
    language: 'typescript',
    pattern: 'hook',
    framework: 'React',
    import: "import { useFlag } from '@/hooks/useFlag';",
    usage: `function Component() {
  const enabled = useFlag('${flagName}');

  return (
    <div>
      {enabled && <NewFeature />}
    </div>
  );
}`,
    explanation: 'React hook pattern with JSX conditional rendering',
  },
  {
    language: 'typescript',
    pattern: 'ternary',
    import: "import { unleash } from './unleash-client';",
    usage: `const result = unleash.isEnabled('${flagName}')
  ? newBehavior()
  : oldBehavior();`,
    explanation: 'Ternary operator for simple conditional logic',
  },
];

/**
 * Python Templates
 */
const pythonTemplates = (flagName: string): CodeTemplate[] => [
  {
    language: 'python',
    pattern: 'if-block',
    import: `from unleash_client import UnleashClient
unleash_client = UnleashClient(...)`,
    usage: `if unleash_client.is_enabled("${flagName}"):
    # Your new feature code here
    pass`,
    explanation: 'Standard if-block pattern with indentation-based scope',
  },
  {
    language: 'python',
    pattern: 'guard',
    import: `from unleash_client import UnleashClient
unleash_client = UnleashClient(...)`,
    usage: `def handler(request):
    if not unleash_client.is_enabled("${flagName}"):
        return {"error": "Feature not available"}, 404

    # Your handler code here`,
    explanation: 'Guard clause pattern for FastAPI/Django/Flask handlers',
  },
  {
    language: 'python',
    pattern: 'decorator',
    framework: 'Django/Flask',
    import: `from unleash_client import UnleashClient
from functools import wraps

def feature_flag(flag_name):
    """Runtime-controllable decorator - checks flag on every call"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not unleash_client.is_enabled(flag_name):
                return {"error": "Feature not available"}, 404
            return func(*args, **kwargs)
        return wrapper
    return decorator`,
    usage: `# ✅ Runtime controllable: Decorator applied at import, flag checked at runtime
@app.route('/api/endpoint')  # Route ALWAYS registered
@feature_flag("${flagName}")  # Flag checked on every request
def my_view(request):
    # Your handler code here
    pass`,
    explanation: 'Runtime-controllable decorator that checks flag on every function call (NOT conditionally applied)',
  },
];

/**
 * Go Templates
 */
const goTemplates = (flagName: string): CodeTemplate[] => [
  {
    language: 'go',
    pattern: 'if-block',
    import: 'import "github.com/Unleash/unleash-client-go/v3"',
    usage: `if unleash.IsEnabled("${flagName}") {
    // Your new feature code here
}`,
    explanation: 'Standard if-block pattern for conditional execution',
  },
  {
    language: 'go',
    pattern: 'guard',
    import: 'import "github.com/Unleash/unleash-client-go/v3"',
    usage: `func Handler(w http.ResponseWriter, r *http.Request) {
    if !unleash.IsEnabled("${flagName}") {
        http.Error(w, "Feature not available", http.StatusNotFound)
        return
    }

    // Your handler code here
}`,
    explanation: 'Guard clause pattern for HTTP handlers',
  },
  {
    language: 'go',
    pattern: 'middleware',
    framework: 'Echo/Gin',
    import: 'import "github.com/Unleash/unleash-client-go/v3"',
    usage: `// ✅ Runtime controllable: Middleware ALWAYS registered, checks flag at runtime
func FeatureFlagMiddleware(flagName string) gin.HandlerFunc {
    return func(c *gin.Context) {
        if !unleash.IsEnabled(flagName) {
            c.JSON(404, gin.H{"error": "Feature not available"})
            c.Abort()
            return
        }
        c.Next()
    }
}

// ALWAYS register the middleware (not wrapped in if-block)
router.Use(FeatureFlagMiddleware("${flagName}"))

// The flag check happens at runtime on every request`,
    explanation: 'Runtime-controllable middleware that checks flag on every request (NOT conditionally registered)',
  },
];

/**
 * Ruby Templates
 */
const rubyTemplates = (flagName: string): CodeTemplate[] => [
  {
    language: 'ruby',
    pattern: 'if-block',
    import: "require 'unleash'\nUNLEASH = Unleash::Client.new(...)",
    usage: `if UNLEASH.is_enabled?('${flagName}')
  # Your new feature code here
end`,
    explanation: 'Standard if-block pattern with Ruby conventions',
  },
  {
    language: 'ruby',
    pattern: 'guard',
    framework: 'Rails',
    import: "require 'unleash'",
    usage: `def show
  unless UNLEASH.is_enabled?('${flagName}')
    render json: { error: 'Feature not available' }, status: :not_found
    return
  end

  # Your controller action code here
end`,
    explanation: 'Guard clause pattern for Rails controllers',
  },
];

/**
 * PHP Templates
 */
const phpTemplates = (flagName: string): CodeTemplate[] => [
  {
    language: 'php',
    pattern: 'if-block',
    import: "use Unleash\\Client\\UnleashBuilder;\n$unleash = UnleashBuilder::create()->build();",
    usage: `if ($unleash->isEnabled('${flagName}')) {
    // Your new feature code here
}`,
    explanation: 'Standard if-block pattern for PHP',
  },
  {
    language: 'php',
    pattern: 'guard',
    framework: 'Laravel',
    import: "use Unleash\\Client\\UnleashBuilder;",
    usage: `public function show(Request $request) {
    if (!$unleash->isEnabled('${flagName}')) {
        return response()->json(['error' => 'Feature not available'], 404);
    }

    // Your controller code here
}`,
    explanation: 'Guard clause pattern for Laravel controllers',
  },
];

/**
 * C# Templates
 */
const csharpTemplates = (flagName: string): CodeTemplate[] => [
  {
    language: 'csharp',
    pattern: 'if-block',
    import: 'using Unleash;',
    usage: `if (_unleash.IsEnabled("${flagName}"))
{
    // Your new feature code here
}`,
    explanation: 'Standard if-block pattern for C#',
  },
  {
    language: 'csharp',
    pattern: 'guard',
    framework: '.NET/ASP.NET',
    import: 'using Unleash;\nusing Microsoft.AspNetCore.Mvc;',
    usage: `[HttpGet]
public IActionResult Get()
{
    if (!_unleash.IsEnabled("${flagName}"))
    {
        return NotFound(new { error = "Feature not available" });
    }

    // Your controller code here
}`,
    explanation: 'Guard clause pattern for ASP.NET controllers',
  },
];

/**
 * Java Templates
 */
const javaTemplates = (flagName: string): CodeTemplate[] => [
  {
    language: 'java',
    pattern: 'if-block',
    import: 'import io.getunleash.Unleash;',
    usage: `if (unleash.isEnabled("${flagName}")) {
    // Your new feature code here
}`,
    explanation: 'Standard if-block pattern for Java',
  },
  {
    language: 'java',
    pattern: 'guard',
    framework: 'Spring Boot',
    import: 'import io.getunleash.Unleash;\nimport org.springframework.web.bind.annotation.*;',
    usage: `@GetMapping("/endpoint")
public ResponseEntity<?> handler() {
    if (!unleash.isEnabled("${flagName}")) {
        return ResponseEntity.status(404)
            .body(Map.of("error", "Feature not available"));
    }

    // Your handler code here
}`,
    explanation: 'Guard clause pattern for Spring Boot controllers',
  },
];

/**
 * Rust Templates
 */
const rustTemplates = (flagName: string): CodeTemplate[] => [
  {
    language: 'rust',
    pattern: 'if-block',
    import: 'use unleash_api_client::client::Client;',
    usage: `if client.is_enabled("${flagName}", None, false) {
    // Your new feature code here
}`,
    explanation: 'Standard if-block pattern for Rust',
  },
  {
    language: 'rust',
    pattern: 'guard',
    framework: 'Actix/Rocket',
    import: 'use unleash_api_client::client::Client;',
    usage: `async fn handler(client: web::Data<Client>) -> Result<HttpResponse> {
    if !client.is_enabled("${flagName}", None, false) {
        return Ok(HttpResponse::NotFound()
            .json(json!({"error": "Feature not available"})));
    }

    // Your handler code here
}`,
    explanation: 'Guard clause pattern for Rust web handlers',
  },
];

/**
 * Get all templates for a specific language and flag name
 */
export function getTemplatesForLanguage(
  language: SupportedLanguage,
  flagName: string
): CodeTemplate[] {
  const templateMap: Record<SupportedLanguage, (flagName: string) => CodeTemplate[]> = {
    typescript: typescriptTemplates,
    javascript: typescriptTemplates,
    python: pythonTemplates,
    go: goTemplates,
    ruby: rubyTemplates,
    php: phpTemplates,
    csharp: csharpTemplates,
    java: javaTemplates,
    rust: rustTemplates,
  };

  return templateMap[language](flagName);
}

/**
 * Get a specific template by pattern
 */
export function getTemplateByPattern(
  language: SupportedLanguage,
  flagName: string,
  pattern: CodeTemplate['pattern'],
  framework?: string
): CodeTemplate | undefined {
  const templates = getTemplatesForLanguage(language, flagName);

  if (framework) {
    return templates.find(t => t.pattern === pattern && t.framework === framework);
  }

  return templates.find(t => t.pattern === pattern && !t.framework);
}

/**
 * Get default template for a language (if-block without framework)
 */
export function getDefaultTemplate(
  language: SupportedLanguage,
  flagName: string
): CodeTemplate {
  const templates = getTemplatesForLanguage(language, flagName);
  const defaultTemplate = templates.find(t => t.pattern === 'if-block' && !t.framework) || templates[0];

  if (!defaultTemplate) {
    throw new Error(`No templates available for language: ${language}`);
  }

  return defaultTemplate;
}
