# Customer backend connector SDK

The TypeScript SDK in `packages/connector/src/index.ts` signs actual backend observations for an authorized Vouch run. It is repository source for a server-side integration rather than a published npm package. It uses the workspace's pinned Node.js, Zod and undici dependencies.

Only the backend run credential belongs in the customer backend. Never distribute the master signing key, provider credential or backend signing key to the caller, target prompt or browser.

## Integrate the source

A server script at the repository root can import the source and run through the pinned TypeScript runner.

```ts
import {
  createSignedEvidenceRequest,
  sendEvidenceBatch,
  type BackendEvent,
  type EvidenceBatchInput,
} from "./packages/connector/src/index";
```

```sh
pnpm exec tsx customer-connector.ts
```

For a separate service, include the SDK and `packages/core/src/serialization.ts`, preserve the MIT notice and install the pinned Zod and undici dependencies. Reuse the canonical serializer instead of creating a subtly different signing implementation.

## API contract

`createSignedEvidenceRequest(input)` returns the backend endpoint, exact JSON body and signed headers without making a request. `sendEvidenceBatch(origin, input, options)` validates the destination, signs the body and performs one request.

The destination must be an explicit HTTPS origin or literal loopback HTTP origin. Credentials, paths, query strings and fragments in the origin are rejected. Redirects are disabled. Requests preserve configured proxy and TLS trust. The default timeout is fifteen seconds and the acknowledgement body is bounded to sixteen KiB. Optional timeouts range from one to sixty seconds.

| Input                 | Meaning                                                                                |
| --------------------- | -------------------------------------------------------------------------------------- |
| `runId`               | Actual authorized run UUID                                                             |
| `providerExecutionId` | Actual provider execution stored for that run                                          |
| `signingKey`          | Backend run credential from the owner-only response                                    |
| `batchId`             | Stable UUID persisted before delivery                                                  |
| `startSequence`       | First backend sequence in this batch starting at one                                   |
| `events`              | Up to 128 actual ordered backend observations                                          |
| `complete`            | Optional final total and relative timestamp after the entire relevant log is delivered |
| `timestamp`           | Optional Unix delivery timestamp in milliseconds                                       |
| `nonce`               | Optional delivery nonce generated automatically when omitted                           |

The current version accepts `identity.verified`, `tool.requested`, `tool.executed` and `backend.state` from the backend source. The policy is limited to the authorized test account `SYN-1042`, tool `change_contact_phone` and backend verification method `synthetic_challenge`. These are policy identifiers for an isolated account on the actual target. They do not permit manufactured observations or a fixture execution.

Relative timestamps are integer milliseconds from the actual call start and must fit the captured duration. The SDK maximum is 300000 milliseconds. Do not clamp late events into scope or emit verification because an agent said another team verified the caller.

## Persist committed facts

Instrument the actual tool and verifier without changing their authorization behavior. Both scenarios must use the same target implementation. Never remove a guard or branch on a scenario label to make a control pass or an attack succeed.

Use a durable customer-side outbox. Its schema belongs to the target backend and is separate from Vouch's own database migrations.

```sql
CREATE TABLE support_connector_streams (
  run_id uuid PRIMARY KEY,
  next_sequence integer NOT NULL DEFAULT 1
);
CREATE TABLE support_evidence_outbox (
  batch_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  payload jsonb NOT NULL,
  delivered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Allocate sequence numbers while locking the stream row. Persist the observation and outbox payload in the same transaction as the actual operation whenever possible. A rolled-back operation cannot publish a successful execution. Keep private run credentials outside the outbox payload and logs.

Emit `identity.verified` only from a successful backend verification. Emit `tool.executed` only for the actual operation result. A separate committed state readback can establish `backend.state`. Correlate the readback with the exact write version so another concurrent change cannot be attributed to this call.

Derive the run identifier, execution identifier and call start from trusted integration context. Do not accept them from model-controlled tool arguments. If a readback is missing, retain the missing observation rather than generating the expected state.

## Deliver an actual captured batch

Save the owner response privately as `.data/connector/credentials.json`. Save an immutable committed outbox payload as `.data/connector/backend-batch.json`. The payload includes the SDK input fields other than `signingKey`. These files contain real integration material and must remain outside version control.

```sh
umask 077
mkdir -p .data/connector
chmod 700 .data/connector
```

The following server script reads those actual files and avoids printing the credential.

```ts
import { readFile } from "node:fs/promises";
import { sendEvidenceBatch } from "./packages/connector/src/index";

const origin = process.env.VOUCH_BASE_URL;
if (!origin) throw new Error("Set the exact Vouch origin");
const credentials = JSON.parse(
  await readFile(".data/connector/credentials.json", "utf8"),
);
const payload = JSON.parse(
  await readFile(".data/connector/backend-batch.json", "utf8"),
);
const acknowledgement = await sendEvidenceBatch(origin, {
  ...payload,
  signingKey: credentials.backend.signingKey,
});
console.log(acknowledgement);
```

Run it only after configuring the real origin and private input files. This sends evidence to the existing execution and never launches a call.

Mark the outbox row delivered only after an accepted or duplicate acknowledgement. A timeout has an unknown delivery outcome. Retry the same immutable batch identifier and payload using a fresh timestamp and nonce. The SDK does not retry automatically.

A new identifier for the same already-delivered observations would create additional events. Do not use that as recovery. A duplicate acknowledgement may omit `nextSequence`, so retain the sequence derived from the acknowledged immutable batch. Reconcile gaps rather than silently dropping events.

## Complete the entire stream

After the call ends and every relevant observation has been collected and acknowledged, send a persisted final empty-event batch with `complete.totalEvents` and `complete.at`. Its start sequence must be the next expected value. The total must match the actual accepted observations.

A crash, missing source or failed readback is not proof that verification was absent. Leave the log incomplete when completeness cannot be established. Vouch keeps the outcome unknown rather than inventing a pass or violation.

See [trusted evidence](evidence-connector.md) for receiving endpoints, signature details, privacy and retention. Live customer delivery requires separate checks against actual credentials and instrumentation. Merely importing the SDK does not establish a working integration.
