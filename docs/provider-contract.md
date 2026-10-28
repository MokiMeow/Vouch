# Bolna caller implementation contract

This guide describes implemented code and the external account settings needed to use it. No real phone call or provider acceptance test was performed for this implementation.

## Official sources

The hosted documentation endpoint remained blocked by the managed network policy. The implementation uses available official source rather than guessing hosted endpoints.

| Source                                                                                                                                                                                | Contract used                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Bolna MCP at 8911a98617335cb89b3cdcdfe780498c7ce3e933](https://github.com/bolna-ai/mcp/tree/8911a98617335cb89b3cdcdfe780498c7ce3e933)                                                | `src/tools/write.ts` defines caller creation, retrieval and real outbound submission. `src/tools/calls.ts` defines queued-only cancellation. `src/tools/read.ts` defines execution retrieval and paginated history.                                    |
| [Bolna runtime at 30cf553b2f77667cf2721a9b8ce7811793469d02](https://github.com/bolna-ai/bolna/tree/30cf553b2f77667cf2721a9b8ce7811793469d02)                                          | `bolna/models.py` defines `task_config.call_terminate`. `bolna/agent_manager/task_manager.py` checks the cap outside the LLM and emits conversation artifacts. Its watchdog checks roughly every two seconds and skips capped hangup after a transfer. |
| [Twilio Node SDK at 1f261bdcf665bc50bc8ca5b67e407e723de07c68](https://github.com/twilio/twilio-node/blob/1f261bdcf665bc50bc8ca5b67e407e723de07c68/src/rest/api/v2010/account/call.ts) | The Call resource supports authenticated GET and POST updates with `TimeLimit` and `Status`. Active calls can be ended with `completed`; queued calls can be cancelled with `canceled`.                                                                |
| [Official Bolna n8n integration at d5d10da5dd8f046027701bd4187dd02d97281d53](https://github.com/bolna-ai/n8n-nodes-bolna/tree/d5d10da5dd8f046027701bd4187dd02d97281d53)               | The README distinguishes in-progress callbacks from completed records whose cost, duration and artifacts are finalized.                                                                                                                                |
| [Original official CLI at 18932e0a3f8e2508ab2b634e4514f2fa0c6fa437](https://github.com/bolna-ai/cli/tree/18932e0a3f8e2508ab2b634e4514f2fa0c6fa437)                                    | Confirms the hosted base, bearer authorization, agent endpoints and `execution_id` or `id` submission response handling.                                                                                                                               |

The API flavor is captured as `hosted-rest-agent-v2-execution-unversioned`. This describes the endpoints used. It does not imply an immutable version of the provider's hosted service.

## Implemented provider boundary

`apps/api/src/bolna.ts` exports the narrow runtime, captured configuration schema and execution identity checks. `bolna-model.ts` normalizes lifecycle and billing fields. `bolna-telephony.ts` implements Twilio call control through the inherited HTTPS proxy with TLS verification and redirects blocked.

The first implemented live path requires a Twilio-backed Bolna caller. Other carrier integrations are not silently treated as equivalent.

1. Read the configured caller template and capture its effective model, speech configuration, prompts and resource capabilities.
2. Require exactly one `conversation` task using `simple_llm_agent` and Twilio input/output. Exclude inherited tools, transfers, graph flows, target connectors and webhooks. Reject credential-bearing configuration fields rather than placing secrets in a captured run or export.
3. Provision a separate caller for each run with that scenario's actual prompt and its own duration cap. The target agent is never edited.
4. Read the provisioned agent back and check its model, prompt and duration. Immediately before dispatch, repeat those checks and confirm the caller name is bound to the run.
5. Submit the real call only after orchestration has persisted the isolated caller identifier and durable submitting marker.
6. Poll the execution, bind it to the isolated caller and target, and preserve actual transcript, recording URL, telephony identity and provider facts.
7. Apply Twilio's carrier-side `TimeLimit` once a correlated SID is available. On stop or expiry, verify the account and recipient again before changing carrier call status.

The Bolna duration cap is set three seconds below the authorized maximum to allow for the runtime's coarse watchdog interval. The worker also maintains its own durable deadline. Transfers are prohibited in this caller so they cannot bypass Bolna's cap.

## Cancellation semantics

`POST /call/{execution_id}/stop` only cancels calls that have not started ringing. It is not advertised as active-call cancellation.

Active termination uses the real Twilio Call resource after validating its SID, configured account and exact authorized recipient. A missing or mismatched SID cannot be replaced by an arbitrary URL or a caller-supplied identifier. The execution remains pending reconciliation when the necessary identity or control is unavailable.

A network timeout, unreadable success response or server failure after call submission can mean the provider accepted the request. The adapter raises `DispatchUnknownError`. The worker must preserve the reservation and global slot and must not submit a second call automatically. Reconciliation searches the isolated caller's executions and requires an exact run correlation. Multiple matches or absent correlation require operator resolution.

## Server configuration

| Variable                                                         | Meaning                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `BOLNA_API_KEY`                                                  | Hosted Bolna credential, kept server-side                                                                    |
| `BOLNA_AGENT_ID`                                                 | Operator-provided caller template, never chosen automatically                                                |
| `VOUCH_LIVE_ENABLED`                                             | Explicit live dispatch switch                                                                                |
| `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`                     | Credentials for the same Twilio account used by the caller                                                   |
| `BOLNA_FROM_PHONE_NUMBER`                                        | Optional explicit authorized caller number                                                                   |
| `AUTHORIZED_PHONE_NUMBERS`                                       | Exact E.164 recipient allowlist                                                                              |
| `VOUCH_RATE_CEILING_CONFIRMED`                                   | Operator confirms the reservation ceiling covers all billable components                                     |
| `VOUCH_BOLNA_MAX_CENTS_PER_MINUTE` and `VOUCH_BOLNA_SETUP_CENTS` | Conservative all-component billing ceiling used before dispatch                                              |
| `BOLNA_COST_UNIT`                                                | Explicit interpretation of the execution cost, either `cents` or `usd`                                       |
| `BOLNA_COST_CURRENCY`                                            | Must be `USD` for the implemented monetary scope                                                             |
| `BOLNA_FINAL_COST_VERIFIED`                                      | Operator has verified that the returned terminal cost is final and includes every required charged component |

The configured cost interpretation is captured with the runtime and reused when normalizing a run. Changing current environment settings cannot silently reinterpret historical captured costs.

Provider fields alone do not establish currency, final billing semantics or full charge coverage. Without the confirmed unit/currency/finalization contract, cost remains unknown and reserved funds remain held. A budget reservation is a conservative admission bound, not a claim that the provider account itself has a spending cap. Verify the configured ceiling against the actual account and its speech, model, platform and telephony prices before enabling live calls.

## Acceptance still performed by the operator

Verify the hosted service honors captured prompts and hard duration, Twilio control reaches the correct account, cost conversion includes all charges, transcripts and audio arrive, and a stopped or expired campaign cannot create an extra call. Validate submission timeout recovery and worker restart behavior with the actual account before customer use.

Neither available source inspection nor a successful TypeScript build establishes successful authentication, phone authorization, carrier controls or a completed live call. These external checks are intentionally left to the user in this work session.
