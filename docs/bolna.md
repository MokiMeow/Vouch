# Bolna integration status

## Source checked during implementation

The Bolna documentation domain was blocked by the cloud's current network policy. No attempt was made to bypass it. The official Bolna GitHub client supplied the API contract:

- [bolna-ai/cli at 18932e0a3f8e2508ab2b634e4514f2fa0c6fa437](https://github.com/bolna-ai/cli/tree/18932e0a3f8e2508ab2b634e4514f2fa0c6fa437)
- [`internal/api/calls.go`](https://github.com/bolna-ai/cli/blob/18932e0a3f8e2508ab2b634e4514f2fa0c6fa437/internal/api/calls.go): `POST /call` takes `agent_id`, `recipient_phone_number`, optional `from_phone_number`, and optional `user_data`; `GET /executions/{id}` retrieves an execution.
- [`internal/api/agents.go`](https://github.com/bolna-ai/cli/blob/18932e0a3f8e2508ab2b634e4514f2fa0c6fa437/internal/api/agents.go): `GET /v2/agent/{id}` retrieves an agent configuration.
- [`internal/api/client.go`](https://github.com/bolna-ai/cli/blob/18932e0a3f8e2508ab2b634e4514f2fa0c6fa437/internal/api/client.go): hosted base `https://api.bolna.ai`, Bearer authentication.
- [`internal/docs/docs.go`](https://github.com/bolna-ai/cli/blob/18932e0a3f8e2508ab2b634e4514f2fa0c6fa437/internal/docs/docs.go): current machine-readable documentation index `https://www.bolna.ai/docs/llms.txt`.

The adapter pins Hosted REST agent-v2/execution-unversioned as the known API flavor. That is not a claim of an immutable provider API version. Actual live agent configuration, caller model, and resolved model identifier must be snapshotted before any future live run; no model is invented for the currently disabled path.

## Operator configuration

Use environment settings for BOLNA_API_KEY (secret, sent only to api.bolna.ai) and BOLNA_AGENT_ID (non-secret configured caller ID). Do not paste secrets into chat or repository files. AUTHORIZED_PHONE_NUMBERS is an exact E.164 comma-separated allowlist set by the operator, not model output. Target registration also requires an authorization reference.

The Integrations screen can perform a read-only connection check. The user-requested key is now configured in a Git-ignored local `.env` (0600), but no caller ID or approved live target is configured. The actual read-only connection request was blocked by the current egress policy, so provider authentication remains unverified. The read-only connection check can list agents without selecting one, or inspect BOLNA_AGENT_ID when explicitly configured. HTTP calls use the inherited proxy, configured TLS trust and a 15-second timeout; redirects are not followed. API errors report HTTP status, not provider response bodies or credentials.

## Required live work

Do not enable dispatch merely by setting credentials. Implement and validate provider-supported cancellation, hard maximum duration, worst-case monetary reservation, stop-condition enforcement, execution-ID persistence before retries, authenticated provider-event/recording ingestion, and customer-backend evidence correlation. A caller prompt telling the model to stop is not enforcement. A network timeout after call submission must not cause a second call without reconciliation.

No outbound call has been attempted, no live audio has been recorded, and no hosted provider action is reported as successful. PSTN is the first contemplated live transport; customer WebSocket/SIP transports are not implemented. Cartesia is not used. Fixture mode exercises the implemented ingestion, evaluation, review, and export workflow without claiming live integration completeness.
