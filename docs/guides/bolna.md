# Bolna live setup

The live PSTN path is implemented behind explicit configuration gates. It uses an isolated Bolna caller for each scenario and Twilio for verified carrier controls. No live call or provider acceptance test was performed for this expansion.

## Provider contract

Read the [pinned official sources and supported contract](../architecture/provider-contract.md) before choosing a caller template. Bolna's documented stop endpoint cancels queued calls only. Active cancellation uses the actual Twilio Call resource after account and destination verification. A caller prompt is not duration enforcement.

The configured template must use exactly one conversation task, a supported simple LLM model and Twilio input/output. Inherited target tools, transfers, graph flows and credential-bearing configuration cannot be captured into a testing caller. The target agent is not modified.

## Prepare server settings

Keep all credentials in an ignored private environment file or secret manager. Do not expose them through frontend variables or paste them into prompts.

```sh
# Existing local .env is preserved
pnpm setup:secrets
# For production, first copy .env.production.example privately
pnpm setup:secrets --file .env.production
```

Configure the following groups using [.env.example](../../.env.example) or [.env.production.example](../../.env.production.example).

| Group                    | Settings                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Caller                   | `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, optional `BOLNA_FROM_PHONE_NUMBER`                         |
| Carrier                  | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` for the same account                                |
| Authorization            | Exact E.164 `AUTHORIZED_PHONE_NUMBERS`, registered target authorization reference             |
| Storage and evidence     | `VOUCH_EVIDENCE_SIGNING_KEY`, `VOUCH_ARTIFACT_KEY`, exact `VOUCH_RECORDING_HOSTS`             |
| Billing interpretation   | `BOLNA_COST_UNIT`, `BOLNA_COST_CURRENCY`, `BOLNA_FINAL_COST_VERIFIED`                         |
| Conservative reservation | `VOUCH_BOLNA_MAX_CENTS_PER_MINUTE`, `VOUCH_BOLNA_SETUP_CENTS`, `VOUCH_RATE_CEILING_CONFIRMED` |
| Activation               | Explicit `VOUCH_LIVE_ENABLED=true` only when preparing authorized acceptance calls            |

Billing units must be `cents` or `usd`, and this release supports USD scope. The rate ceiling must include all charged model, speech, platform and carrier components. Confirm that the provider's terminal cost has the claimed finalization and charge coverage. Do not mark these confirmations true simply to bypass a blocker. Missing final billing holds the reservation and call slot.

The managed environment must allow `api.bolna.ai`, `api.twilio.com` and the exact approved recording hosts through its supported network policy. Earlier provider checks were blocked before authentication could be verified. No new connectivity check was run as part of this change. Saving a network configuration draft does not activate it.

The benign caller also requires `VOUCH_SYNTHETIC_CHALLENGE`, the fictional challenge accepted by the approved sandbox for `SYN-1042`. This value is captured in the immutable regression configuration and supplied only to the benign scenario. Never use a real customer credential. The adversarial prompt receives no challenge code.

## Connect the target backend

Instrument the approved target's actual verification and phone-change tool. Use the [backend connector contract](evidence-connector.md) and [TypeScript SDK with durable SQL outbox guidance](connector-sdk.md).

An owner opens the run's connector setup to obtain separate per-run backend and provider keys. Keep the backend key in the customer server, away from the target agent's prompts and speech. Every batch identifies the correlated provider execution and a continuous backend sequence. Send the complete-log marker only after all committed observations have been delivered.

## Use the implemented workflow

1. Apply database migrations and start the API and worker with the same approved settings.
2. Sign in when using session mode. Owners can use the Integrations screen for a read-only connection check.
3. Register an allowlisted PSTN target and its authorization reference.
4. Select live mode and set a valid window, call count, duration and budget that can reserve both initial calls.
5. Campaign preparation reads and captures the caller configuration. The worker provisions isolated callers, persists submission state and dispatches the control followed by the adversarial case.
6. Review actual provider artifacts and signed backend evidence. Unknown observations remain unknown.
7. Confirm or dismiss terminal findings, rerun within remaining scope and export the regression JSON.

A submission timeout is not evidence that no call was placed. The worker searches for an exact correlated execution. Owners can supply a known execution ID through the reconciliation action, which independently verifies its identity before binding it. The application never treats a missing response as permission to place a second call.

See [the orchestration state machine](../architecture/live-orchestration.md) for scope, stop, budget, restart and cleanup behavior. Validate the provider's actual prompts, duration, cancellation, pricing, transcript and recording semantics before customer use. These checks are intentionally left to the team performing testing.
