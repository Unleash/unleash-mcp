# Unleash Feature Flag Best Practices (Digest)

Reference: <https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale>

- **Own the lifecycle** – every flag needs an explicit owner who tracks rollout, communicates status, and removes stale flags promptly.
- **Limit lifetime** – plan removal as soon as the guarded change is fully rolled out. Short-lived flags reduce maintenance risk and cognitive load.
- **Prefer reuse** – check for existing flags that already target the same behavior. Extending a current flag is often safer than creating a duplicate.
- **Name intentionally** – choose descriptive, scoped names (e.g., `checkout.async-shipping`) so readers understand the flag’s purpose at a glance.
- **Document rationale** – capture why the flag exists, the rollback plan, and cleanup trigger in the description or accompanying notes.
- **Stage rollouts** – enable flags in non-production environments first, then perform gradual or percentage rollouts to production.
- **Monitor and clean up** – keep an eye on usage metrics, and remove the flag (plus dead code) when the change is stable.
