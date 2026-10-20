---
name: update-openapi-spec
description: Regenerate the Unleash API types (src/unleash/api.d.ts) from the Unleash OpenAPI spec. Use when an Unleash endpoint or field is missing or outdated in the generated types.
---

# Update the OpenAPI spec

1. `npm run spec:update` downloads the spec from the Unleash sandbox to `src/unleash/openapi.json` (gitignored) and regenerates `src/unleash/api.d.ts`. If the spec is already downloaded, `npm run spec:generate` only regenerates.
2. Review the `api.d.ts` diff for changes to endpoints the code uses.
3. Run `npm test`.

Don't upgrade TypeScript past 5.x: `openapi-typescript` needs the compiler API that TypeScript 7 no longer ships.
