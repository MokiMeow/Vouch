# Acceptance and implementation checklist

The [original brief](product-brief.md) defines release acceptance. The [current handoff](project-status.md) distinguishes implemented code from unperformed tests.

## Earlier fixture baseline

The previous release exercised campaign creation, real fictional-account PostgreSQL writes/readbacks, deterministic grading, human reviews, immutable configuration digests, bounded reruns and regression exports. It passed 60 unit tests, 168 PostgreSQL/HTTP assertions and three browser suites.

Those results predate the live/authentication expansion. They do not validate this new release.

## New implementation delivered

- Isolated Bolna scenario callers with captured configuration, model and actual dispatch code
- Twilio account/recipient-verified cancellation and carrier duration controls
- Durable reservations, deadlines, submission markers, restart recovery and unknown-outcome reconciliation
- Signed per-run customer backend evidence with replay/sequence/completeness checks
- Actual provider transcripts and encrypted recording archive/playback, owner redaction/deletion and artifact retry
- Workspace authentication, owner/member access, CSRF and forced PostgreSQL tenant policies
- Native Node production builds, nonroot containers, health/heartbeat checks, retention and guarded backup/restore
- Updated UI and seven public guides exposing the supported workflow and its configuration gates

## Acceptance left to the user

1. Review/update isolated test harness setup for the new authentication, tenant context and signed evidence contract.
2. Verify unit, database, HTTP, browser, accessibility, security and operational behavior for the expanded implementation.
3. Configure the supported real caller/carrier and explicitly authorized target.
4. Validate both bounded spoken scenarios with actual audio, transcript, backend proofs and final all-component costs.
5. Exercise hard duration, cancellation, stop, submission uncertainty, restart and concurrent-worker behavior.
6. Review a real finding, rerun within scope and inspect its regression export.
7. Build/deploy the containers behind HTTPS and exercise backup, restore, retention and workspace isolation.

No unit, integration, browser or real-call tests were run for this expansion, as requested. No public deployment, provider authentication, completed live call or recovery success is claimed. Additional transports and runtime providers remain optional future extensions.
