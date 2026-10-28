# Vouch project status

Assessed on October 28, 2026 against the [original project brief](product-brief.md).

## Completion estimate

**Approximately 65% complete for the full product described in the brief.** This is an engineering estimate of delivered capability, not a measured test-coverage percentage or a claim that 65% of development time has elapsed. The uncertainty is roughly five percentage points because provider integration effort is not yet established.

The local synthetic workflow is implemented and tested from campaign creation to regression export. Complete acceptance requires a real autonomous Bolna call with enforced resource limits, actual recordings and trusted customer evidence. That path remains incomplete. Additional UI polish does not close it.

| Area                   | Current capability                                                                                                   | Remaining work                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Setup and persistence  | Node/pnpm setup, SQL migrations, retained PostgreSQL data, separate worker                                           | Fresh-task restoration verification                                                                    |
| Target and scope       | Synthetic targets, phone-registration allowlisting, immutable bounds, queue locking and bounded reruns               | Provider-enforced duration, cancellation and cost limits                                               |
| Policy and evaluation  | One versioned phone-change policy, trusted verification checks, graded evidence and explicit unknown outcomes        | Broader policies after the first live case                                                             |
| Caller runtime         | Deterministic fixture, narrow Bolna boundary and read-only connection-check implementation                           | Credential verification, autonomous spoken dispatch and reconciliation                                 |
| Evidence               | Synthetic transcripts, normalized events, actual fixture tool writes and SQL readbacks, protected ingestion contract | Customer connector, live callbacks, recordings, finalized costs and correlation                        |
| Review and regressions | Findings, review history, configuration digests, bounded reruns and JSON exports                                     | Validation with actual live artifacts                                                                  |
| Interface and guides   | Responsive landing/workspace, original mascots, accessible controls and seven guides                                 | User feedback and further assistive-technology testing                                                 |
| Production operation   | Loopback binding, input validation, secret isolation and public-file boundary                                        | Authentication, tenant isolation, retention/redaction, encryption, monitoring, recovery and deployment |

## Working end-to-end path

The [application flow](application-flow.md) maps components and source files. A user authorizes a fictional target and bounded scope. The API stores an immutable snapshot and queued cases. A separate worker runs the verified control and false-authority fixture against the same support backend. Tool execution changes a fictional account in PostgreSQL and records independent state observations. The deterministic evaluator checks trusted event order and account identity, then the workspace presents evidence for review, rerun or export.

The conversation is synthetic. Browser speech synthesis is optional replay, not recorded audio. No live provider authentication or outbound call is claimed as successful.

## Remaining delivery sequence

1. Establish supported provider access, verify credentials with a read-only request and configure the caller plus an explicitly authorized target. The last attempted provider request was blocked before authentication could be verified.
2. Implement provider-supported cancellation and hard duration limits, reserve worst-case budget, persist execution identifiers and reconcile uncertain submissions before retrying. Enforce stop conditions outside the caller prompt.
3. Implement authenticated callback and recording ingestion plus a customer backend connector. Correlate trusted events to the correct run and account independently of caller statements.
4. Run one bounded live benign control and one false-authority case. Validate actual transcript/audio, tool activity, backend state, verdict, review, rerun and exported regression. Retain evidence of resource-limit enforcement.
5. Before public customer use, implement authentication and tenant authorization, secure artifact storage, retention/redaction, monitoring, recovery and deployment checks. Add history pagination before larger datasets.

Additional runtimes, SIP/WebSocket/WebRTC bridges and broader policy authoring are expansion work. They are not required to prove the first live PSTN case, and none is represented as implemented.

## Verification evidence

The latest application validation passed 60 unit tests, 168 real PostgreSQL/HTTP assertions and three browser suites. Browser checks covered the fixture lifecycle, stale responses and recovery, public Docs, copying, accessibility and layouts from 320 to 2560 pixels. The production build and dependency audit also passed.

These results cover the implemented local application. They do not certify the live path or production security. See [acceptance](acceptance.md), [repository audit](repository-audit.md), [performance findings](performance-audit.md), [design verification](../design-qa.md) and [Bolna integration status](bolna.md).
