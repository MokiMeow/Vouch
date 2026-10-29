# Trusted evidence and recordings

Vouch separates customer backend facts from caller speech and provider observations. A transcript claiming that verification succeeded never creates a trusted identity event. A recording proves what was said, while the backend connector proves which tool ran and what state changed.

## Server configuration

| Setting                         | Purpose                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `VOUCH_EVIDENCE_SIGNING_KEY`    | Base64-encoded random 32-byte master key used to derive separate per-run backend and provider credentials |
| `VOUCH_ARTIFACT_KEY`            | Independent base64-encoded random 32-byte AES-256-GCM encryption key                                      |
| `VOUCH_ARTIFACT_DIR`            | Private recording directory, default `.data/artifacts`                                                    |
| `VOUCH_RECORDING_HOSTS`         | Comma-separated exact HTTPS hostnames approved for provider recording downloads                           |
| `VOUCH_ARTIFACT_MAX_BYTES`      | Maximum recording download size, default 33554432 and maximum 134217728                                   |
| `VOUCH_ARTIFACT_RETENTION_DAYS` | Recording lifetime, default 30 and maximum 3650 days                                                      |

Provision both independent keys through the deployment secret manager. Do not put the master keys in caller prompts, browser settings or customer connectors. Keep the artifact key available for the full lifetime of encrypted recordings and backups. Changing it without re-encrypting stored data makes existing recordings unreadable.

Recording downloads use the inherited HTTP proxy and TLS trust. Redirects, HTTP URLs, embedded credentials, explicit ports and unapproved hosts are rejected. The configured allowlist is an operator trust decision and must contain the actual provider storage hostname. Private and loopback literal addresses are rejected. Wildcards are not supported.

## Establish a connector

An authenticated workspace owner requests `GET /api/runs/{runId}/connector-credentials`. This is an explicit action because the response contains run-scoped credentials. Its response supplies the correlated provider execution identifier, separate backend and provider endpoints, signing keys and header names. Do not obtain these credentials from a public share URL.

Install only the backend signing key inside the authorized customer backend. A provider bridge receives only its separate provider key. Possession of a provider key cannot create backend tool facts or declare the verification log complete. Master key rotation invalidates previously distributed run credentials.

The execution identifier must be the actual stored provider execution. A callback for a different execution or an unknown run is rejected. Only the actual stored live execution can accept correlated observations. Callbacks are accepted while the live run is active or waiting for its bounded evidence grace period. Once the run completes, its evidence cannot be silently changed by a late callback.

## Send ordered backend events

Send an actual captured batch to `POST /api/runs/{runId}/backend-events`. No sample tool execution is provided as a runnable event because fabricated evidence must never be delivered as an observation.

| Field                 | Meaning                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| `batchId`             | UUID persisted with the immutable outbox payload                                  |
| `providerExecutionId` | Actual correlated provider execution stored for the run                           |
| `startSequence`       | First observation sequence in the batch starting at one                           |
| `events`              | Actual committed backend observations in their recorded order                     |
| `complete`            | Optional final total and timestamp only after the relevant log is fully delivered |

The current policy addresses the isolated authorized test account `SYN-1042` on the actual PSTN target. The account and challenge are controlled policy inputs rather than generated execution evidence. It accepts backend `identity.verified`, `tool.requested`, `tool.executed` and `backend.state` events. Relative timestamps use integer milliseconds from call start and must fit the captured maximum duration. Verification must precede execution by timestamp and sequence. The current policy requires the backend verification method `synthetic_challenge`.

Number observations from one within each connector stream. Start the next batch at the returned `nextSequence`. A gap or reused sequence is rejected. Preserve the actual observation order rather than arranging facts to obtain a desired verdict.

Backend state events supply independently observed `before` and `after` strings with the same account identifier. They must follow the corresponding tool execution. A successful provider status or a caller saying that the account changed does not establish backend state.

## Sign each delivery

The signature uses HMAC-SHA256 with the per-run signing-key string as UTF-8 bytes. Its input joins three values with newline characters.

1. Unix timestamp in integer milliseconds
2. Fresh nonce containing 16 to 100 letters, numbers, underscores or hyphens
3. Canonical JSON of the request body

Canonical JSON follows `sha256-sorted-json-v1`, recursively sorting object keys in JavaScript UTF-16 order and preserving array order. The signature itself is lowercase hexadecimal. Send the timestamp, nonce and signature in `x-vouch-timestamp`, `x-vouch-nonce` and `x-vouch-signature`.

The following Node.js command signs an actual batch captured by your instrumentation. Store both input files privately outside source control. `credentials.json` is the authenticated owner response and `backend-batch.json` contains actual observations, not invented demo evidence.

```sh
node --input-type=module <<'JS'
import { readFile } from 'node:fs/promises';
import { createHmac, randomUUID } from 'node:crypto';
const credentials = JSON.parse(await readFile('.data/connector/credentials.json', 'utf8'));
const batch = JSON.parse(await readFile('.data/connector/backend-batch.json', 'utf8'));
const base = process.env.VOUCH_BASE_URL;
if (!base) throw new Error('Set VOUCH_BASE_URL to your authenticated Vouch origin');
const body = JSON.stringify(batch, (_key, value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
    : value
);
const timestamp = String(Date.now());
const nonce = randomUUID();
const signature = createHmac('sha256', credentials.backend.signingKey)
  .update(`${timestamp}\n${nonce}\n${body}`).digest('hex');
const response = await fetch(new URL(credentials.backend.endpoint, base), {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-vouch-timestamp': timestamp,
    'x-vouch-nonce': nonce,
    'x-vouch-signature': signature
  },
  body,
  redirect: 'error'
});
if (!response.ok) throw new Error(`Evidence delivery failed with HTTP ${response.status}`);
console.log(await response.json());
JS
```

Timestamps have a five-minute delivery tolerance. Request batches have an immutable UUID and body digest. Retrying the same batch returns a duplicate acknowledgement without duplicating events. Reusing its identifier with different content or reusing a nonce for a different batch is rejected. Use a new timestamp and nonce when redelivering after a failed network request.

## Mark the log complete

After all backend observations have been delivered, send a final signed batch with an empty `events` array and `complete` containing `totalEvents` and `at`. Its `startSequence` must equal the next expected sequence. The total must equal the number of accepted backend events, and the completion timestamp must cover the latest backend observation.

Only do this when the customer connector has flushed the entire relevant verification and execution log. This explicit assertion is necessary to establish that a required precondition was absent. Without it, the deterministic outcome remains unknown even when a tool execution is present. Completing a stream is irreversible for that run.

## Provider observations

The separate `POST /api/runs/{runId}/provider-events` route uses the provider signing key and the same batch/signature format. It accepts only transcript and provider events and rejects backend sources and verification-completeness claims. Provider stream sequences are independent from backend stream sequences.

The worker can also ingest a typed Bolna execution snapshot directly. It records provider status and observed cost/duration fields without upgrading them into backend facts. The actual final transcript is stored as a provider transcript without inventing speaker turns or word timestamps. Final transcript changes after capture are rejected. Recording ingestion is separate from policy evaluation.

## Recordings and retention

Recordings are fetched only from the approved HTTPS hosts with a bounded timeout and byte limit. Supported audio content types are checked before download. The server encrypts each file using AES-256-GCM with a fresh nonce and binds its authentication tag to artifact, run and execution identifiers. Files use generated UUID names and private permissions. URLs and provider credentials are not exposed to the browser.

Authenticated workspace members can list `GET /api/runs/{runId}/artifacts` and retrieve the returned artifact URL. Audio delivery supports byte ranges for native playback controls. Before delivery the server verifies encryption authentication, byte length and SHA-256 integrity. Expired or deleted artifacts cannot be retrieved.

Workspace owners can request `DELETE /api/runs/{runId}/artifacts/{artifactId}`. This records redaction and removes the encrypted file. Maintenance removes expired metadata and ciphertext in bounded batches. Backups must preserve the database and encrypted artifact directory together while services are stopped, with encryption keys kept separately.

Actual customer callbacks and provider recordings require verification against the configured account. Local controlled tests do not establish provider acceptance. Missing configuration and provider failures stay visible as unavailable recordings rather than being replaced with generated audio.

## Owner transcript redaction

A workspace owner can request `POST /api/runs/{runId}/redact-transcript` after a run finishes. This replaces transcript event payloads with an explicit redaction marker and SHA-256 digests of the original text and payload. It also removes the transcript copy from the stored provider snapshot and appends a redaction audit event.

Backend events and deterministic verdicts remain unchanged because policy evaluation does not treat transcript text as backend proof. Repeated redaction is idempotent. The current live run cannot be redacted while its provider may still ingest conversation content. Recording deletion is a separate owner action and should be used together with transcript redaction when removing the conversation itself. Retained backups require their own expiry policy and cannot be retroactively modified by an online redaction request.

Campaign retention calls `purgeRunArtifacts` before deleting parent database rows, so cascading metadata deletion cannot silently leave encrypted recordings behind. Filesystem removal must succeed before metadata is eligible for cleanup.

## Twilio media authentication

If Bolna supplies a Twilio-hosted recording, explicitly allow `api.twilio.com` in `VOUCH_RECORDING_HOSTS` and configure the server-only `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`. Vouch attaches HTTP Basic authentication only to that exact hostname and an account-matching `/2010-04-01/Accounts/{accountSid}/Recordings/{recordingSid}` media path with an optional `.wav` or `.mp3` suffix. Query parameters, alternate accounts and unrelated Twilio paths are rejected. Redirects remain disabled.

Vouch does not guess or rewrite recording URLs. An extensionless URL must actually return an approved audio content type; a JSON metadata response is unavailable as audio. This boundary follows the official [Twilio Recording resource](https://www.twilio.com/docs/voice/api/recording) and inspected [Twilio Node SDK recording source](https://github.com/twilio/twilio-node/blob/1f261bdcf665bc50bc8ca5b67e407e723de07c68/src/rest/api/v2010/account/recording.ts). Signed storage URLs on other approved hosts are fetched without Twilio or Bolna credentials.

Owner-deleted or expired recordings receive a persistent per-run tombstone. Later provider polling cannot recreate those recordings after retention removes their metadata. Transcript and recording redaction do not retroactively remove encrypted backups, so backup expiry remains part of the deployment policy.

## Recover late provider artifacts

A workspace owner can request `POST /api/runs/{runId}/artifacts/retry` for a finished live run when the provider completes audio or transcript processing after the bounded evidence window. The server makes a read-only execution lookup and verifies its execution identifier, isolated caller, authorized target and run correlation before accepting anything.

Recovery can append a final provider transcript only when no transcript was previously captured and the owner has not redacted it. It never replaces recorded transcript content or creates backend facts. Backend evidence stays closed and deterministic verdicts do not change. A missing recording can be downloaded and encrypted under the same allowlist and retention controls. Retry does not provision an agent or create another call.

The response reports `recording` and `transcript` statuses separately. HTTP 409 means at least one artifact is still missing and can accompany successful recovery of the other artifact. Refresh the run after every attempt. An expired run cannot recover new artifacts. Owner-deleted or expired recordings cannot be regenerated, and retry does not extend their retention window.

An owner who intentionally does not want a recording can request `POST /api/runs/{runId}/artifacts/redact`. This removes existing ciphertext and permanently marks recording recovery disabled, including when audio never arrived and there is no artifact identifier to delete. It appends a redaction audit event and permits isolated caller cleanup once the transcript has also been captured or explicitly redacted. This is separate from transcript redaction and does not claim that a missing recording was ever captured.

## Export readiness

A regression export requires actual recorded evidence. A queued or evidence-free run returns HTTP 409 rather than a generated finding. A transcript can establish what was said without establishing tool execution or backend state. Keep each evidence tier separate and preserve unknown outcomes when trusted observations are incomplete.

Supabase stores the event, review and artifact metadata through the server PostgreSQL connection. Encrypted recording bytes remain in the configured private artifact directory. Follow [Supabase PostgreSQL](../operations/supabase.md) for migrations and connection security. Database access does not by itself establish provider or connector readiness.
