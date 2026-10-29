# Acceptance and implementation checklist

The [original brief](../reference/product-brief.md) defines the product goal. The [current status](../project-status.md) records the implemented scope and verification results. Acceptance must distinguish a passing local check from an actual provider or database result.

## Real data boundary

Normal workspace flows use real registered targets, actual provider executions and persisted observations. Setup does not seed calls, findings, dashboard counters or transcripts. An empty workspace remains empty. Missing evidence stays unknown or unavailable rather than being generated to fill the interface.

The current policy uses the isolated test identity Alex Morgan and account `SYN-1042` on an actual approved target. The `synthetic_challenge` method is a versioned test-account policy contract. These inputs do not replace real calls, signed backend instrumentation or actual state observations. Preserve the target's verification rules for both scenarios.

## Checks available before provider credentials

1. Install the pinned dependencies and run type checking, the production build and unit checks.
2. Verify placeholder configuration is rejected safely without printing secrets or connecting to a guessed database.
3. Review ordered SQL migrations and their role requirements against the Supabase guide.
4. Verify public routes, responsive layout, keyboard access and error states without presenting example product data.
5. Exercise HTTP and database behavior only against an explicitly configured disposable test database.
6. Record exact commands, results and blockers in the verification report.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

Database and browser suites require their documented test services and an isolated database. A controlled test payload is test evidence only. It must not appear as a real product call or imply provider acceptance. Never point destructive integration checks at retained workspace or customer data.

## Database acceptance after credentials

1. Supply the actual Supabase PostgreSQL connection through private server configuration.
2. Confirm verified TLS and an appropriate direct or session-pooler connection.
3. Apply the versioned migrations using a schema-owning role with the required role-management permissions.
4. Reapply migrations to confirm the ledger prevents silent replay or changed applied SQL.
5. Verify sign-in, owner bootstrap, workspace membership and row-level isolation using separate test workspaces.
6. Exercise backup and restore on an isolated destination with encryption keys available separately.

See [Supabase PostgreSQL](../operations/supabase.md) for exact connection settings and privileges. PostgreSQL superuser access is not inherently required. Do not infer remote migration success from the presence of a connection placeholder.

## Real call acceptance after authorization

1. Configure the actual Bolna caller, same-account Twilio credentials and exact approved PSTN target.
2. Verify read-only provider access and resolve every readiness blocker before enabling dispatch.
3. Confirm all-component rates and final billing semantics from the actual account.
4. Authorize a window of 1 to 1440 minutes with sufficient call slots, duration and budget.
5. Run the control and false-authority scenario against the same unchanged target.
6. Inspect actual audio, provider transcript, signed backend facts and final costs.
7. Exercise stop, expiry, duration controls, ambiguous submission, restart and concurrent-worker behavior under separately approved scope.
8. Review a supported terminal finding, rerun within remaining scope and inspect its regression export.

An evidence-free export must return HTTP 409. Unknown submission must not trigger an automatic replacement call. Missing billing information must not be treated as zero cost. Missing recording or backend verification must not be converted into fabricated evidence.

## Reporting results

Record what actually ran and preserve relevant nonsecret output. Separate static checks, controlled database checks, browser checks and actual provider acceptance. Mark credential-dependent checks blocked until the real private values and authorization exist. No successful remote database migration, provider authentication, call, cancellation, final billing or recovery is established by this checklist itself.
