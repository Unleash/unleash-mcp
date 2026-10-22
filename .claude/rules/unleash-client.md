---
paths:
  - "src/unleash/**"
---

# Unleash HTTP client

- `src/unleash/api.d.ts` is generated: never edit it. Regenerate with the `update-openapi-spec` skill.
- Call Unleash through the typed `openapi-fetch` client; don't hand-write request or response types.
- The OpenAPI specification is found at https://sandbox.getunleash.io/enterprise/docs/openapi.json

Why: `docs/decisions.md` (Unleash HTTP client).
