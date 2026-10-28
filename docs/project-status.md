# Vouch implementation and acceptance handoff

Updated on October 28, 2026 against the [original brief](product-brief.md).

## Implementation status

The core coding areas for the first PSTN release are implemented, including the previously missing live runtime, resource-control state machine, customer evidence connector, authenticated workspace access and deployment operations. The previous approximate 65 percent assessment described the earlier fixture-only implementation and is superseded by this checklist.

**Acceptance testing is pending by explicit user request.** Code implementation is not proof of a working provider account or a production-ready deployment. No new successful provider authentication, live call, container deployment, backup restoration or fresh-task recovery is claimed.

| Brief capability         | Implemented code                                                                                                                        | Acceptance still required                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Authorized target        | Fixture and operator-allowlisted PSTN registration with authorization reference                                                         | Verify the recipient is owned or explicitly authorized                              |
| Bounded campaign         | Immutable scope, call slots, global concurrency, durable deadlines, conservative reservations, cancellation and stop handling           | Verify actual provider/carrier limits and the account's all-component price ceiling |
| Explicit policy          | Versioned phone-change policy with trusted identity-verification precondition                                                           | Instrument the same fictional account and tool in the approved target backend       |
| Autonomous spoken caller | Isolated Bolna caller per scenario, actual prompt/model capture, dispatch and Twilio control                                            | Verify the configured supported caller and realized conversation                    |
| Realized evidence        | Provider transcript normalization, actual recording capture, signed backend batches, complete-log marker and encrypted artifact storage | Confirm actual provider fields/audio and trustworthy customer event correlation     |
| Deterministic evaluation | Trusted event/account/order checks, evidence tiers and explicit unknown outcomes                                                        | Validate control and adversarial outcomes using real artifacts                      |
| Human review             | Evidence timeline, transcript, audio, terminal findings, review history and privacy controls                                            | Reviewer and accessibility acceptance of the expanded interface                     |
| Rerun and export         | Captured configuration integrity, bounded rerun and versioned JSON export                                                               | Validate reproduction using the actual caller and customer target                   |
| Workspace access         | Scrypt passwords, opaque sessions, CSRF, owner/member management, restricted-role PostgreSQL RLS and cross-workspace references         | Authentication, authorization, concurrency and isolation review                     |
| Operation                | Native Node builds, nonroot Compose services, health/heartbeat checks, maintenance, retention and guarded backup/restore                | Build images, deploy behind HTTPS and exercise recovery                             |

Additional runtime providers and SIP/WebSocket/WebRTC transports are optional expansion work. The first implemented live path is PSTN through a Twilio-backed Bolna caller. Custom policy authoring, SSO and email-based recovery are not claimed as part of this first release.

## Configuration the operator supplies

Use [Bolna setup](bolna.md), [the provider contract](provider-contract.md), [live orchestration](live-orchestration.md) and [deployment](deployment.md).

- A supported Bolna caller template and credentials for its Twilio account
- The exact authorized E.164 target allowlist and authorization reference
- `VOUCH_SYNTHETIC_CHALLENGE` matching the fictional sandbox account so the benign caller can actually complete verification
- Correct cost units/currency, finalization semantics and a conservative all-inclusive rate ceiling
- Exact approved recording hostnames and server-side signing/encryption keys
- For production, database credentials, an HTTPS origin and initial workspace owner credentials
- Customer-side instrumentation using the [connector SDK](connector-sdk.md), keeping backend signing keys away from the target LLM

The ignored local environment retains the existing provider credential. Missing signing and artifact-encryption keys were generated privately without printing values or replacing existing keys. Live dispatch remains disabled unless an operator explicitly configures and enables it.

## Implemented failure behavior

An uncertain submission is not retried automatically. Its reservation and global live slot remain held until a correlated provider execution is recovered. Only a provably unsent preflight failure can release an unused reservation. A known live call is cancelled through verified carrier identity when stop, deadline or authorization changes require it.

Missing finalized cost remains unresolved. A confirmed duration or billing overrun stops the campaign and records an operational warning. A reservation is an admission bound based on the operator's pricing contract, not a provider-account spending cap.

Final backend evidence is accepted only within the configured delivery window. Missing evidence stays unknown. Actual recording capture can be retried by an owner without inventing audio. Privacy redaction retains provenance digests and backend facts. Isolated caller cleanup must not erase remote execution history before required artifacts are captured or explicitly discarded under policy.

## What was and was not checked

The combined web/native server production build completed successfully, including strict TypeScript compilation. The required database migration also completed successfully. Formatting, shell/JavaScript syntax and static integration review were performed. No unit, integration, browser, load, security-acceptance or voice-call test suite was run for this expansion. The prior 60 unit tests, 168 PostgreSQL/HTTP assertions and three browser suites describe the earlier fixture baseline only.

Existing test harnesses target the earlier fixture API. Their authorization, signed evidence and isolated database setup must be reviewed alongside the new acceptance cases by the team performing testing. Those older results must not be reused as release approval for this implementation.

The [action log](action-log.md) records the implementation and actual build/migration outcomes. The [application flow](application-flow.md) maps components. Release approval depends on the operator's testing and deployment checks.
