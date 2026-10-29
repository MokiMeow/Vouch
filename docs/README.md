# Vouch documentation

Start with [project status](project-status.md) for the implemented real PSTN workflow, verification results and credential-dependent acceptance boundaries. Normal setup does not seed calls, findings or dashboard statistics. Missing connections and evidence remain unavailable rather than being replaced with demo data. The [repository README](../README.md) provides installation commands and a source map.

## Setup and product guides

- [Live Bolna setup](guides/bolna.md) covers the actual caller, carrier, isolated test-account challenge and activation gates.
- [Authentication and workspaces](guides/authentication.md) explains session mode, owner bootstrap, memberships and tenant isolation.
- [Backend evidence connector](guides/evidence-connector.md) defines signed delivery, continuous sequences, completeness and privacy behavior.
- [Connector SDK](guides/connector-sdk.md) shows customer-side TypeScript and durable SQL outbox integration.
- [Acceptance checklist](guides/acceptance.md) separates implemented capabilities from local verification from actual account acceptance.

## Architecture and contracts

- [Application flow](architecture/application-flow.md) maps the request, execution, evidence, review and export components.
- [Domain glossary](architecture/domain-glossary.md) defines the product's evidence and campaign terms.
- [Provider contract](architecture/provider-contract.md) lists official sources, supported capabilities and external limitations.
- [Live orchestration](architecture/live-orchestration.md) explains reservations, state transitions, reconciliation, deadlines and cleanup.

## Operation

- [Supabase PostgreSQL](operations/supabase.md) covers default database setup, TLS, separate migration credentials, versioned SQL and required role privileges. Docker is optional for a separate local database.

- [Cloud startup](operations/cloud-start.md) restores managed development services without resetting data.
- [Production deployment](operations/deployment.md) covers configuration, containers, health, retention and guarded backup/restore.

## Reports and history

- [Current desktop report follow-up](reports/desktop-followup.md) records the reported fixes, selected design and isolated verification results.

- [Repository audit](reports/repository-audit.md), [performance audit](reports/performance-audit.md) and [design verification](reports/design-qa.md) retain the historical fixture baseline. Their results are not acceptance of the later live/authentication expansion.
- [Design notes](reports/design-redesign.md) explain the current visual system and preserve creator/license references.
- [Action history](history/action-log.md) records changes and their validation. Paths in older entries describe the layout at that time.
- [Original brief](reference/product-brief.md) preserves the supplied text without edits.

The dashboard screenshot in `assets/` is a deliberate README asset. Generated screenshots, browser output, coverage, caches and runtime data remain ignored outside this documentation tree. Repository notes are not published by the application's HTTP asset allowlist.

## Where changes belong

Keep API entry points at `apps/api/src/` root and place implementation in its owning domain folder. Keep frontend pages, feature UI, shared infrastructure and styles in their corresponding folders. Domain rules and checks belong to `packages/core/`; customer evidence delivery belongs to `packages/connector/`.

Add setup and integration instructions to `guides/`, contracts to `architecture/`, operational procedures to `operations/` and dated audit material to `reports/`. Update this index when adding a guide. Preserve references and third-party notices. Read [AGENTS.md](../AGENTS.md) for implementation boundaries and safe verification.
