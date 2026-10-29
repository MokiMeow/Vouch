# Bolna live setup

Vouch uses an isolated Twilio-backed Bolna caller for each authorized scenario. Normal campaign launch places actual PSTN calls and never substitutes a fixture. Missing credentials leave the integration unavailable. This guide does not claim live account acceptance before the actual credentials and target are supplied.

## Provider contract

Read the [official sources and supported contract](../architecture/provider-contract.md) before selecting a caller template. Bolna's documented stop endpoint cancels queued calls only. Active cancellation uses the actual Twilio Call resource after account and destination verification. Prompt text is not duration enforcement.

The caller template must have exactly one conversation task, a supported simple LLM model and Twilio input/output. Inherited tools, transfers, graph flows and credential-bearing configuration are not accepted in the testing caller. Vouch captures the caller configuration without rewriting the target agent or weakening its tools.

## Prepare private server settings

Preserve existing configuration and generate only missing local cryptographic keys.

```sh
test -e .env || (umask 077; cp .env.example .env)
chmod 600 .env
pnpm setup:secrets
```

Fill the following values through a private editor or secret manager. Blank fields are intentional until the operator supplies actual credentials. Never paste a key into frontend variables, prompts, examples or version control.

| Group                  | Settings                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Caller                 | `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, optional `BOLNA_FROM_PHONE_NUMBER`                         |
| Carrier                | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` for the same account                                |
| Authorization          | Exact E.164 `AUTHORIZED_PHONE_NUMBERS` and a registered target authorization reference        |
| Evidence               | `VOUCH_EVIDENCE_SIGNING_KEY` and actual backend instrumentation                               |
| Recording              | `VOUCH_ARTIFACT_KEY` and exact `VOUCH_RECORDING_HOSTS`                                        |
| Billing interpretation | `BOLNA_COST_UNIT`, `BOLNA_COST_CURRENCY`, `BOLNA_FINAL_COST_VERIFIED`                         |
| Reservation            | `VOUCH_BOLNA_MAX_CENTS_PER_MINUTE`, `VOUCH_BOLNA_SETUP_CENTS`, `VOUCH_RATE_CEILING_CONFIRMED` |
| Activation             | `VOUCH_LIVE_ENABLED=true` only when authorized real-call acceptance is ready                  |

The database connection is configured independently using [Supabase PostgreSQL](../operations/supabase.md). A database connection, a provider connection and carrier control are separate checks.

## Confirm billing and network access

Billing units must be `cents` or `usd`. This release supports USD scope. The conservative rate ceiling must cover model, speech, platform and telephony charges. Confirm the final cost includes the claimed components before setting the confirmation flags. Do not set a flag merely to bypass a blocker. Missing final billing preserves the reservation and global call slot.

Allow the actual provider endpoints and recording hosts through the environment's supported network controls. Typical API hosts are `api.bolna.ai` and `api.twilio.com`. Keep TLS verification enabled. A network failure can occur before authentication and does not prove an API key is invalid.

## Prepare the approved test account

The current policy speaks the fictional identity Alex Morgan and account `SYN-1042` during an actual call. Set `VOUCH_SYNTHETIC_CHALLENGE` to the challenge accepted by that authorized isolated test account. This challenge is captured in the regression configuration and supplied only to the benign control. Never use a real customer credential.

The false-authority scenario receives no challenge. Both scenarios reach the same target tool implementation. Do not branch on scenario labels or remove the target's verification guard to force an expected finding.

## Connect actual backend evidence

Instrument the approved target's actual verification and phone-change tool. Follow the [backend evidence contract](evidence-connector.md) and [connector SDK](connector-sdk.md).

An owner explicitly reveals the run's separate backend and provider credentials. Keep the backend key in customer server infrastructure, outside the target prompt and browser. Every delivered batch must identify the stored provider execution and preserve continuous observation order. Declare completeness only after all relevant committed logs have been delivered.

## Authorize and launch

1. Configure the database and apply migrations before starting API and worker services.
2. Sign in and use Integrations for a read-only provider check.
3. Register an operator-allowlisted PSTN target with its authorization reference.
4. Set a window of 1 to 1440 minutes, call count, duration and sufficient positive budget.
5. Review the scope and enable dispatch only when the displayed actual calls are intended.
6. Launch the control and false-authority pair against the unchanged approved target.
7. Review actual artifacts and signed backend observations before confirming a finding.

The server captures the caller, prompts, billing interpretation and scope. The worker persists submission state before contacting the provider. A timeout does not prove that no call was placed. Unknown submission holds the slot while reconciliation searches for the existing correlated execution. Owner reconciliation still independently verifies the supplied execution.

## Acceptance boundary

Read-only connection success establishes provider read access only. Actual prompts, audio, transcript, carrier duration, cancellation, final charges, signed backend delivery and recovery require acceptance against the configured account. Record each result separately. See [live orchestration](../architecture/live-orchestration.md) and [acceptance](acceptance.md) for the remaining checks.
