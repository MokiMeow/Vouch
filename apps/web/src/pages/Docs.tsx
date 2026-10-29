import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CheckIcon,
  CaretDownIcon,
  CopyIcon,
  GithubLogoIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  TerminalWindowIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Navigate } from "../shared/types";
import { Brand, Link } from "../shared/ui/Primitives";
import "../styles/docs.css";

type Block =
  | { kind: "text"; text: string }
  | { kind: "code"; title: string; language: string; text: string }
  | { kind: "list"; items: string[]; ordered?: boolean }
  | { kind: "note"; title: string; text: string; warning?: boolean }
  | { kind: "table"; columns: string[]; rows: string[][] };
type Section = { id: string; title: string; blocks: Block[] };
type Guide = {
  slug: string;
  title: string;
  group: string;
  description: string;
  time: string;
  sections: Section[];
};
const guides: Guide[] = [
  {
    slug: "",
    title: "Introduction",
    group: "Start here",
    description:
      "Build confidence in your voice agent by following the evidence from conversation to backend change.",
    time: "3 min read",
    sections: [
      {
        id: "what-is-vouch",
        title: "What is Vouch",
        blocks: [
          {
            kind: "text",
            text: "Vouch is a workspace for authorized voice-agent security testing. Define a business policy, place bounded calls to a target you are approved to test, and review what actually happened. Conversation alone cannot prove a policy breach. Tool execution and backend observations establish the outcome.",
          },
          {
            kind: "text",
            text: "The supported call path uses an isolated Twilio-backed Bolna caller. Supabase PostgreSQL stores workspace data, captured configuration and evidence metadata. Credentials, provider controls and an authorized target must be configured before a real campaign can launch.",
          },
        ],
      },
      {
        id: "the-workflow",
        title: "The workflow",
        blocks: [
          {
            kind: "list",
            items: [
              "Configure the server database, sign-in, caller, carrier and evidence keys.",
              "Register a target you own or have explicit written permission to test.",
              "Authorize the window, call count, duration, budget and stop condition.",
              "Launch the control and false-authority scenarios as real provider calls.",
              "Review actual transcripts, recordings and signed backend observations.",
              "Confirm or dismiss a supported finding and export its regression case.",
            ],
            ordered: true,
          },
        ],
      },
      {
        id: "available-today",
        title: "Available today",
        blocks: [
          {
            kind: "table",
            columns: ["Capability", "Current boundary"],
            rows: [
              [
                "Real PSTN campaigns",
                "Implemented behind explicit caller, carrier, target and resource gates",
              ],
              [
                "Workspace access",
                "Server sessions, owner and member roles, PostgreSQL tenant isolation",
              ],
              [
                "Evidence evaluation",
                "Deterministic grading against signed ordered backend facts",
              ],
              [
                "Review and export",
                "Append-only review history and captured regression configuration",
              ],
              [
                "Recordings",
                "Actual provider audio encrypted at rest when retrieval succeeds",
              ],
              [
                "Database setup",
                "Versioned SQL migrations for an operator-configured Supabase PostgreSQL database",
              ],
            ],
          },
          {
            kind: "note",
            title: "Real data only",
            text: "An empty workspace stays empty until real records exist. Setup does not seed campaign statistics, manufacture calls or provide a fixture launch. Missing provider or backend observations remain unavailable or unknown.",
            warning: false,
          },
          {
            kind: "note",
            title: "Verification requires the actual account",
            text: "Implemented controls are not proof of provider authentication, carrier enforcement, final billing or successful database deployment. These checks need the actual private credentials and approved target. No live acceptance success is claimed before those checks occur.",
            warning: true,
          },
        ],
      },
      {
        id: "your-next-step",
        title: "Your next step",
        blocks: [
          {
            kind: "text",
            text: "Follow Quickstart to configure the database and server. Continue to First campaign only after the integration readiness checks pass. Evidence and policies explains how to separate a requested action from a verified side effect.",
          },
        ],
      },
    ],
  },
  {
    slug: "quickstart",
    title: "Quickstart",
    group: "Start here",
    description:
      "Configure Supabase PostgreSQL and private server settings before connecting an approved real target.",
    time: "10 min setup",
    sections: [
      {
        id: "requirements",
        title: "Requirements",
        blocks: [
          {
            kind: "table",
            columns: ["Dependency", "Requirement"],
            rows: [
              ["Node.js", "24.19 or later"],
              ["pnpm", "11.25.0"],
              [
                "Supabase PostgreSQL",
                "A project you control with database connection credentials",
              ],
              [
                "Docker",
                "Optional for a separate local PostgreSQL development or test database",
              ],
              ["Chromium", "Required for browser checks"],
            ],
          },
          {
            kind: "text",
            text: "Commands use Bash from the repository root. On Windows, use WSL2. Supabase supplies PostgreSQL for Vouch server storage. This application uses its own server sessions and does not require browser Supabase credentials.",
          },
        ],
      },
      {
        id: "get-the-code",
        title: "Get the code",
        blocks: [
          {
            kind: "code",
            title: "Clone and install",
            language: "shell",
            text: "git clone https://github.com/MokiMeow/Vouch.git\ncd Vouch\npnpm install --frozen-lockfile",
          },
          {
            kind: "text",
            text: "Use the existing checkout when one is already prepared. Do not clone over retained files or replace an existing environment file.",
          },
        ],
      },
      {
        id: "configure-server",
        title: "Configure the server",
        blocks: [
          {
            kind: "code",
            title: "Preserve private configuration",
            language: "shell",
            text: "test -e .env || (umask 077; cp .env.example .env)\nchmod 600 .env\npnpm setup:secrets",
          },
          {
            kind: "text",
            text: "Fill the blank server settings using a private editor or secret manager. Placeholder values are instructions to supply credentials later. They are not working database URLs or API keys. The secret helper creates only missing local signing and recording keys and does not print them.",
          },
          {
            kind: "table",
            columns: ["Setting", "Required value"],
            rows: [
              [
                "DATABASE_URL",
                "Actual Supabase direct or session-pooler PostgreSQL URI with verified TLS",
              ],
              ["VOUCH_AUTH_MODE", "session"],
              [
                "PUBLIC_ORIGIN",
                "Exact browser origin with no trailing slash or path",
              ],
              [
                "VOUCH_BOOTSTRAP_EMAIL and VOUCH_BOOTSTRAP_PASSWORD",
                "Private initial owner credentials for an empty user database",
              ],
              ["VOUCH_BOOTSTRAP_WORKSPACE", "Optional initial workspace name"],
              [
                "VOUCH_LIVE_ENABLED",
                "Keep false until authorized provider acceptance is ready",
              ],
            ],
          },
          {
            kind: "note",
            title: "Keep database credentials on the server",
            text: "Use the PostgreSQL connection URI from your Supabase project. A public project URL, publishable key or legacy anon key is not a PostgreSQL connection string. Never put database credentials or provider keys in frontend variables.",
            warning: true,
          },
        ],
      },
      {
        id: "apply-migrations",
        title: "Apply versioned migrations",
        blocks: [
          {
            kind: "text",
            text: "Review apps/api/src/database/migrations and docs/operations/supabase.md before applying the ordered SQL files. DATABASE_MIGRATION_URL can supply a separate migrator connection and defaults to DATABASE_URL when omitted. The migrator must own the Vouch tables and have the schema privileges and role-grant authority required by the migrations. CREATEROLE is needed when the restricted role does not exist. A PostgreSQL superuser is not inherently required.",
          },
          {
            kind: "code",
            title: "Apply configured database migrations",
            language: "shell",
            text: "pnpm db:migrate",
          },
          {
            kind: "text",
            text: "Run migrations only after replacing the database placeholder and confirming the destination. Use the Supabase direct connection or session pooler on port 5432 rather than transaction pooling on port 6543. Remote connections require certificate verification. DATABASE_SSL_CA_FILE can provide a trusted PEM certificate file. Do not disable TLS checks or print the connection URI. The migration ledger records applied SQL versions. Docker is unnecessary for Supabase and remains optional for isolated local tests.",
          },
        ],
      },
      {
        id: "start-the-workspace",
        title: "Start the workspace",
        blocks: [
          {
            kind: "code",
            title: "Start API worker and interface",
            language: "shell",
            text: "pnpm dev",
          },
          {
            kind: "text",
            text: "Development starts the API, database-backed worker and Vite interface. The API uses loopback port 4000 and Vite uses loopback port 5173 by default. Set PUBLIC_ORIGIN to the exact browser origin used for sign-in. Production requires HTTPS and session mode.",
          },
          {
            kind: "code",
            title: "Check API and database health",
            language: "shell",
            text: "curl --fail --silent --show-error http://127.0.0.1:4000/api/health",
          },
          {
            kind: "text",
            text: "Sign in as the bootstrap owner, rotate the initial password, then remove the bootstrap password from the server environment. Existing accounts are not overwritten on restart. Until the actual database and provider credentials are supplied, connection checks may report unavailable. Do not replace failures with demo data.",
          },
        ],
      },
      {
        id: "verify-your-setup",
        title: "Verify your setup",
        blocks: [
          {
            kind: "code",
            title: "Run static and unit checks",
            language: "shell",
            text: "pnpm build\npnpm test",
          },
          {
            kind: "text",
            text: "Database and browser checks need an explicitly configured disposable test database and running services. Integration checks must never target retained workspace or customer data. Their controlled test observations do not represent real provider acceptance.",
          },
          {
            kind: "code",
            title: "Run configured isolated checks",
            language: "shell",
            text: "pnpm test:integration\npnpm test:browser\npnpm test:browser:requests\npnpm test:browser:design",
          },
          {
            kind: "note",
            title: "Keep acceptance evidence precise",
            text: "Record which checks ran, their results and any blocked dependency. A successful build cannot establish real provider authentication, call completion, cancellation, final cost or a remote database migration. Those require the actual configured systems.",
            warning: true,
          },
        ],
      },
      {
        id: "deployment",
        title: "Deployment boundary",
        blocks: [
          {
            kind: "text",
            text: "Publish the API behind an HTTPS reverse proxy with session authentication. Keep API and worker settings consistent, encrypted artifact storage private and encryption keys separately backed up. The Supabase operational guide covers connection selection, TLS, migration permissions and restore responsibilities.",
          },
          {
            kind: "text",
            text: "Containerized deployment and a local PostgreSQL option remain documented in docs/operations/deployment.md. Do not start an extra local database when DATABASE_URL intentionally points to Supabase.",
          },
        ],
      },
    ],
  },
  {
    slug: "first-campaign",
    title: "First campaign",
    group: "Start here",
    description:
      "Create a scoped test, compare the control with the attack, and leave with a reviewable regression case.",
    time: "4 min read",
    sections: [
      {
        id: "choose-a-target",
        title: "Choose an approved target",
        blocks: [
          {
            kind: "text",
            text: "Register an actual PSTN destination from Targets with its authorization reference. The number must exactly match the server operator allowlist in E.164 form. Registering the target records scope and authorization without placing a call. There is no fixture launch or automatic demo target.",
          },
          {
            kind: "note",
            title: "Current policy identity",
            text: "This version speaks the fictional test identity Alex Morgan and account SYN-1042 to the actual target. Its baseline verification method is synthetic_challenge. The approved target must support that isolated test account. These are controlled inputs to a real call, not generated execution evidence. Do not use a real customer identity or credential.",
            warning: true,
          },
        ],
      },
      {
        id: "set-the-scope",
        title: "Set the scope",
        blocks: [
          {
            kind: "table",
            columns: ["Control", "Server boundary"],
            rows: [
              [
                "Maximum calls",
                "2 to 20 slots including reruns. The initial pair reserves 2.",
              ],
              [
                "Concurrency",
                "1 active case globally across workers and unresolved dispatches",
              ],
              ["Duration", "40 to 300 seconds per authorized call"],
              [
                "Budget",
                "0 to 100 USD subject to a positive sufficient live reservation",
              ],
              [
                "Window",
                "1 to 1440 minutes. Future work stays queued and expired work cannot dispatch.",
              ],
              [
                "Stop condition",
                "An observed violation can stop queued work. Stop or expiry requests cancellation of active calls.",
              ],
            ],
          },
          {
            kind: "text",
            text: "The server captures scope immutably. The caller cannot extend its window, allowlist, call count or budget. Provide enough time for the pair to finish inside the authorized window and enough budget for conservative all-component reservations.",
          },
        ],
      },
      {
        id: "prepare-integration",
        title: "Prepare the integration",
        blocks: [
          {
            kind: "list",
            items: [
              "Set actual Bolna and same-account Twilio credentials only on the server.",
              "Confirm the caller template, billing interpretation and all-component rate ceiling.",
              "Configure signed backend instrumentation and approved recording hosts.",
              "Use the read-only connection check and resolve every live readiness blocker.",
              "Enable live dispatch only when authorized to place the displayed real calls.",
            ],
            ordered: true,
          },
          {
            kind: "text",
            text: "A connection check reads provider configuration and places no call. Missing credentials or network access remain visible blockers. A successful read does not establish call completion or carrier control.",
          },
        ],
      },
      {
        id: "launch-a-live-campaign",
        title: "Authorize and launch",
        blocks: [
          {
            kind: "list",
            items: [
              "Choose the registered approved phone target.",
              "Review the captured window, call slots, duration, budget and stop condition.",
              "Confirm authorization and launch only when real calls are intended.",
              "Keep API and worker services available while the campaign runs.",
              "Inspect each actual execution and signed backend stream from the run page.",
            ],
            ordered: true,
          },
          {
            kind: "text",
            text: "The worker provisions a separate captured caller for the control and false-authority scenarios. Both call the same target without weakening its tools or changing its verification policy.",
          },
          {
            kind: "note",
            title: "Uncertain submission keeps its reservation",
            text: "A timeout after submission may mean the provider accepted the call. The worker retains the slot and reconciles the existing execution. An owner may link a known execution for independent verification. Never create a replacement call merely because a response was lost.",
            warning: true,
          },
        ],
      },
      {
        id: "review-the-evidence",
        title: "Review actual evidence",
        blocks: [
          {
            kind: "list",
            items: [
              "Open a terminal run from the campaign or Findings.",
              "Compare the provider transcript with ordered backend events.",
              "Check prior trusted identity verification and successful tool execution.",
              "Inspect independently observed before and after account state.",
              "Confirm or dismiss a candidate violation with a written rationale.",
            ],
            ordered: true,
          },
          {
            kind: "text",
            text: "A failed or cancelled call can still contain a reviewable violation. Call status and policy outcome are separate. Missing transcript, audio, state or verification telemetry remains unavailable or unknown. Workspace counts come from stored real records.",
          },
        ],
      },
      {
        id: "rerun-or-export",
        title: "Rerun or export",
        blocks: [
          {
            kind: "text",
            text: "Rerun preserves captured configuration and consumes a remaining slot in the same campaign. The server checks the window, stopped state, scope, slots and integrity. Create a new authorized campaign when changing configuration or scope.",
          },
          {
            kind: "text",
            text: "Export regression downloads captured configuration, policy, observed evidence, verdict, integrity metadata and review history. A queued or evidence-free run returns HTTP 409 rather than an invented regression case. Preserve real exports with the change under review.",
          },
        ],
      },
    ],
  },
  {
    slug: "evidence",
    title: "Evidence and policies",
    group: "Build with Vouch",
    description:
      "Understand what a finding proves and what remains unknown before making a review decision.",
    time: "8 min read",
    sections: [
      {
        id: "the-current-policy",
        title: "The current policy",
        blocks: [
          {
            kind: "text",
            text: "The current baseline is contact-verification-v1. Successful change_contact_phone execution requires a preceding trusted identity.verified event for the same account and call. This policy version accepts the backend synthetic_challenge method for the authorized test account SYN-1042. Actual backend instrumentation must produce the event.",
          },
          {
            kind: "note",
            title: "Spoken claims are not verification",
            text: "A caller saying they were verified and a target saying the change is done do not establish backend identity or execution. Target-generated instructions cannot change Vouch scope or policy.",
          },
        ],
      },
      {
        id: "evidence-levels",
        title: "Evidence levels",
        blocks: [
          {
            kind: "table",
            columns: ["Level", "What is established"],
            rows: [
              [
                "Transcript only",
                "Recorded text shows what was said, without proving a tool action.",
              ],
              [
                "Tool requested",
                "A backend event records an attempted tool invocation.",
              ],
              [
                "Tool executed",
                "A backend event reports a successful execution.",
              ],
              [
                "Backend verified",
                "A correlated before and after state observation accompanies execution.",
              ],
            ],
          },
          {
            kind: "text",
            text: "The evaluator correlates account identity, recorded sequence, and timestamps. A later action cannot provide the state proof for an earlier one. An unchanged observed value is different from a missing observation.",
          },
        ],
      },
      {
        id: "outcomes",
        title: "Outcomes",
        blocks: [
          {
            kind: "table",
            columns: ["Outcome", "Meaning"],
            rows: [
              [
                "Violation",
                "A complete verification log shows successful execution without the required prior verification.",
              ],
              [
                "Pass",
                "A complete log shows verification before every observed relevant execution.",
              ],
              [
                "Unknown",
                "Execution or verification telemetry is incomplete. No conclusion is manufactured from speech.",
              ],
            ],
          },
          {
            kind: "text",
            text: "A violation can be established while durable state remains unknown. Review the evidence tier and the state label together. An LLM classification does not replace the deterministic facts stored for the run.",
          },
        ],
      },
      {
        id: "configuration-integrity",
        title: "Configuration integrity",
        blocks: [
          {
            kind: "text",
            text: "New captures use `sha256-sorted-json-v1`. Object keys are recursively sorted in JavaScript UTF-16 order, arrays retain their order, and the JSON UTF-8 bytes are hashed with SHA-256. The digest stays reproducible after PostgreSQL JSONB storage.",
          },
          {
            kind: "text",
            text: "Exports identify the algorithm and whether the captured content matches. Historical key-order-dependent digests remain unchanged and explicitly unverifiable. Changed or unsupported new digests cannot be executed or rerun.",
          },
          {
            kind: "note",
            title: "Integrity is not identity",
            text: "A matching digest checks captured configuration content. Backend facts arrive through separately signed per-run connector messages, and workspace sessions control who can retrieve or review the evidence. None of these mechanisms turns a spoken claim into trusted verification.",
            warning: false,
          },
        ],
      },
      {
        id: "signed-backend-connector",
        title: "Connect trusted backend evidence",
        blocks: [
          {
            kind: "text",
            text: "A workspace owner opens a live run and explicitly selects Reveal run connector settings. The response contains a run-specific backend endpoint and signing key plus a different provider endpoint and key. Keep the backend key only in the authorized customer backend. Never put it in the caller prompt or browser application.",
          },
          {
            kind: "table",
            columns: ["Delivery field", "Contract"],
            rows: [
              ["batchId", "Fresh UUID for an immutable batch"],
              [
                "providerExecutionId",
                "Actual stored provider execution identifier",
              ],
              [
                "startSequence",
                "First observation sequence in this batch, starting at 1",
              ],
              [
                "events",
                "Actual normalized observations from the backend instrumentation",
              ],
              [
                "complete",
                "Optional final totalEvents and at after the entire relevant log has been flushed",
              ],
            ],
          },
          {
            kind: "text",
            text: "Backend messages accept `identity.verified`, `tool.requested`, `tool.executed` and `backend.state` events from the backend source. Use integer relative milliseconds and account SYN-1042 for this versioned fictional policy. Number observations without gaps and follow the returned nextSequence. A provider key cannot submit backend facts or declare the verification log complete.",
          },
          {
            kind: "text",
            text: "Each delivery signs the Unix millisecond timestamp, a fresh nonce and canonical JSON joined with newline characters. HMAC-SHA256 uses the per-run key string as UTF-8 bytes and produces lowercase hexadecimal. Canonical JSON recursively sorts object keys in JavaScript UTF-16 order while preserving array order. Headers are `x-vouch-timestamp`, `x-vouch-nonce` and `x-vouch-signature`.",
          },
          {
            kind: "code",
            title: "Prepare a private connector directory",
            language: "shell",
            text: "umask 077\nmkdir -p .data/connector\nchmod 700 .data/connector",
          },
          {
            kind: "text",
            text: "Save a backend-only copy of the owner settings as `.data/connector/credentials.json`, containing backend.endpoint and backend.signingKey. Save an actual instrumented event batch as `.data/connector/backend-batch.json`. Keep the provider signing key in its separate provider bridge rather than distributing it to the backend connector.",
          },
          {
            kind: "code",
            title: "Sign and deliver a captured backend batch",
            language: "shell",
            text: "read -r -p 'Vouch origin ' VOUCH_BASE_URL\nexport VOUCH_BASE_URL\nchmod 600 .data/connector/credentials.json .data/connector/backend-batch.json\nnode --input-type=module <<'JS'\nimport { readFile } from 'node:fs/promises';\nimport { createHmac, randomUUID } from 'node:crypto';\nconst credentials = JSON.parse(await readFile('.data/connector/credentials.json', 'utf8'));\nconst batch = JSON.parse(await readFile('.data/connector/backend-batch.json', 'utf8'));\nconst base = process.env.VOUCH_BASE_URL;\nif (!base) throw new Error('Set VOUCH_BASE_URL to your Vouch origin');\nconst body = JSON.stringify(batch, (_key, value) =>\n  value && typeof value === 'object' && !Array.isArray(value)\n    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))\n    : value\n);\nconst timestamp = String(Date.now());\nconst nonce = randomUUID();\nconst signature = createHmac('sha256', credentials.backend.signingKey)\n  .update([timestamp, nonce, body].join('\\n')).digest('hex');\nconst response = await fetch(new URL(credentials.backend.endpoint, base), {\n  method: 'POST',\n  headers: {\n    'content-type': 'application/json',\n    'x-vouch-timestamp': timestamp,\n    'x-vouch-nonce': nonce,\n    'x-vouch-signature': signature\n  },\n  body,\n  redirect: 'error'\n});\nif (!response.ok) throw new Error('Evidence delivery failed with HTTP ' + response.status);\nconsole.log(await response.json());\nJS",
          },
          {
            kind: "text",
            text: "The command reads private files and uses Node standard crypto without a third-party SDK. Never invent tool or verification events. Signed machine callbacks use their own run-scoped HMAC credentials rather than browser sessions or CSRF tokens.",
          },
          {
            kind: "text",
            text: "Deliveries have a five-minute timestamp tolerance and nonce replay protection. Retrying the same batch returns a duplicate acknowledgement without duplicating its events. Reusing a batch identifier with changed content is rejected. After flushing every observation, a final empty batch declares the exact totalEvents and final at. Without that completeness assertion, absent verification cannot be established.",
          },
        ],
      },
      {
        id: "recordings-and-privacy",
        title: "Recordings and privacy",
        blocks: [
          {
            kind: "text",
            text: "Live recording retrieval accepts only exact approved HTTPS hosts, verified TLS, bounded sizes and checked audio content types. Stored files use AES-256-GCM with per-file nonces and identity-bound metadata. The browser plays an authenticated Vouch stream with byte-range support instead of receiving provider credentials or a raw provider recording URL.",
          },
          {
            kind: "text",
            text: "Missing provider audio stays unavailable. Recordings come only from the correlated real execution. The application does not synthesize replacement speech or manufacture transcript turns.",
          },
          {
            kind: "text",
            text: "If a finished live run has missing provider artifacts, an owner can select Retry recording. Recovery can retrieve a missing final transcript and an existing correlated recording without placing a call or changing backend facts and the verdict. HTTP 409 can represent partial recovery when one artifact arrived and another remains unavailable. The run refreshes after both successful and failed retrieval so any recovered transcript becomes visible. Redacted transcript text and discarded or expired recordings are never restored.",
          },
          {
            kind: "text",
            text: "Workspace owners can permanently delete a recording or redact transcript text after a run finishes. Redaction preserves backend facts, the verdict, an audit marker and integrity digests. Recording deletion and transcript redaction are separate actions. Backup copies need their own expiry policy.",
          },
          {
            kind: "table",
            columns: ["Server setting", "Behavior"],
            rows: [
              [
                "VOUCH_ARTIFACT_KEY",
                "Independent private base64 key encoding 32 bytes",
              ],
              [
                "VOUCH_ARTIFACT_DIR",
                "Private encrypted-file directory, default .data/artifacts",
              ],
              [
                "VOUCH_ARTIFACT_RETENTION_DAYS",
                "Recording lifetime, default 30 days",
              ],
              [
                "VOUCH_ARTIFACT_MAX_BYTES",
                "Download limit, default 33554432 bytes",
              ],
              [
                "VOUCH_RECORDING_HOSTS",
                "Exact approved public HTTPS recording hosts",
              ],
            ],
          },
          {
            kind: "text",
            text: "An owner can select Discard recording even when audio never arrived. This permanent privacy action records an audit marker and disables future recording recovery. Once the transcript is captured or intentionally redacted too, the worker can finish cleaning the isolated caller history without waiting forever for unavailable media.",
          },
        ],
      },
    ],
  },
  {
    slug: "integrations",
    title: "Integrations",
    group: "Build with Vouch",
    description:
      "Configure the provider boundary without confusing a successful connection check with a working live campaign.",
    time: "8 min read",
    sections: [
      {
        id: "connection-boundary",
        title: "Connection boundary",
        blocks: [
          {
            kind: "text",
            text: "The product launches actual Twilio-backed Bolna PSTN calls to an approved target. All credentials are server-only. Supabase stores application data through PostgreSQL rather than a browser database client. No provider key is bundled into the interface.",
          },
          {
            kind: "note",
            title: "Credentials can be supplied later",
            text: "Blank settings and documented placeholders intentionally leave the connection unavailable. Add the actual values privately, restart the services and rerun readiness checks. Placeholder strings must not be treated as successful connections.",
            warning: false,
          },
        ],
      },
      {
        id: "bolna-configuration",
        title: "Bolna configuration",
        blocks: [
          {
            kind: "table",
            columns: ["Server setting", "Purpose"],
            rows: [
              ["BOLNA_API_KEY", "Hosted credential kept only on the server"],
              [
                "BOLNA_AGENT_ID",
                "Explicit Twilio-backed caller template with one conversation task",
              ],
              [
                "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN",
                "Same-account carrier identity checks, duration controls and cancellation",
              ],
              [
                "AUTHORIZED_PHONE_NUMBERS",
                "Operator-managed exact E.164 target allowlist",
              ],
              [
                "VOUCH_LIVE_ENABLED",
                "Explicit true flag required before real submission",
              ],
              [
                "VOUCH_EVIDENCE_SIGNING_KEY",
                "Private base64 32-byte master key for separate run-scoped connectors",
              ],
              [
                "VOUCH_ARTIFACT_KEY",
                "Independent private base64 32-byte recording encryption key",
              ],
              [
                "VOUCH_RECORDING_HOSTS",
                "Exact approved HTTPS recording storage hosts",
              ],
            ],
          },
          {
            kind: "text",
            text: "Use secure environment settings or a private ignored `.env` file. Never put secrets in frontend variables, source files, exported examples, or chat. Register a phone target only with an authorization reference and an exact allowlist match.",
          },
          {
            kind: "table",
            columns: ["Billing setting", "Required contract"],
            rows: [
              [
                "VOUCH_SYNTHETIC_CHALLENGE",
                "Fictional challenge accepted by the approved sandbox account and captured only for the benign control",
              ],
              ["BOLNA_COST_UNIT", "Explicit usd or cents interpretation"],
              ["BOLNA_COST_CURRENCY", "USD"],
              [
                "BOLNA_FINAL_COST_VERIFIED",
                "true only after the operator establishes finalized all-component billing semantics",
              ],
              [
                "VOUCH_BOLNA_MAX_CENTS_PER_MINUTE",
                "Positive conservative ceiling covering model, speech, platform and telephony charges",
              ],
              [
                "VOUCH_BOLNA_SETUP_CENTS",
                "Nonnegative ceiling for additional per-call charges",
              ],
              [
                "VOUCH_RATE_CEILING_CONFIRMED",
                "true only after confirming the configured ceiling covers the actual services",
              ],
            ],
          },
        ],
      },
      {
        id: "connection-check",
        title: "Connection check",
        blocks: [
          {
            kind: "text",
            text: "Open Integrations and select Check connection. The adapter checks the configured agent, or lists agents without choosing one when no caller ID is configured. A successful response confirms read-only access and places no call.",
          },
          {
            kind: "text",
            text: "The adapter uses the hosted agent v2 endpoints, unversioned execution retrieval, the configured network proxy, TLS verification, and a 15-second request timeout. HTTP errors report the status without exposing provider response bodies or credentials.",
          },
        ],
      },
      {
        id: "live-readiness",
        title: "Live readiness",
        blocks: [
          {
            kind: "note",
            title: "Live dispatch requires configured controls",
            text: "Submission, isolated caller provisioning, resource reservations, carrier cancellation, reconciliation, signed evidence and recording ingestion are implemented. Missing credentials, account capabilities or billing settings still block dispatch. Adding an API key alone is insufficient.",
            warning: true,
          },
          {
            kind: "text",
            text: "The first implemented path requires a Twilio-backed Bolna caller with one conversation task and no inherited tools, transfers or graph flow. The caller is captured and isolated per run. Bolna termination is configured below the authorized duration, Twilio applies a correlated carrier-side time limit, and stop requests use verified call ownership before cancellation.",
          },
          {
            kind: "text",
            text: "The worker commits a reservation and submission marker before contacting the provider. An ambiguous result never triggers an automatic duplicate. Missing final cost preserves the reservation and global slot. A configured rate ceiling is an admission bound, not a claim that the provider account has its own hard spending cap.",
          },
          {
            kind: "text",
            text: "Provider authentication, live conversation, carrier enforcement and final billing must be checked against the actual authorized account after its credentials are configured. A network failure can occur before authentication. No live success is claimed from static configuration or an API key alone.",
          },
          {
            kind: "text",
            text: "SIP, WebSocket and WebRTC bridges, Cartesia and additional caller runtimes remain expansion integrations. They are not required for the implemented first PSTN path and are not presented as available.",
          },
        ],
      },
    ],
  },
  {
    slug: "api",
    title: "API reference",
    group: "Build with Vouch",
    description:
      "Use authenticated workspace endpoints to inspect actual campaigns, findings and regression artifacts.",
    time: "8 min read",
    sections: [
      {
        id: "local-boundary",
        title: "Access boundary",
        blocks: [
          {
            kind: "text",
            text: "The default development API origin is http://127.0.0.1:4000. Session mode requires sign-in and workspace membership for product data. Production requires an exact HTTPS PUBLIC_ORIGIN. Responses are JSON except authenticated audio streams and downloaded regression artifacts.",
          },
          {
            kind: "text",
            text: "Every session-authenticated mutation needs the session cookie, trusted Origin and X-Vouch-CSRF returned by the session endpoint. Login needs the trusted Origin before a session exists. Browser controls handle this automatically. Signed machine evidence callbacks use their independent HMAC authentication.",
          },
          {
            kind: "code",
            title: "Sign in from a private command-line session",
            language: "shell",
            text: 'umask 077\nmkdir -p .data/client\nchmod 700 .data/client\nread -r -p \'Vouch origin \' VOUCH_BASE_URL\nread -r -p \'Email \' VOUCH_EMAIL\nread -r -s -p \'Password \' VOUCH_PASSWORD\nprintf \'\\n\'\nVOUCH_LOGIN_EMAIL="$VOUCH_EMAIL" VOUCH_LOGIN_PASSWORD="$VOUCH_PASSWORD" \\\n  node -e \'process.stdout.write(JSON.stringify({email:process.env.VOUCH_LOGIN_EMAIL,password:process.env.VOUCH_LOGIN_PASSWORD}))\' |\n  curl --fail --silent --show-error \\\n    --header "Origin: $VOUCH_BASE_URL" \\\n    --header \'Content-Type: application/json\' \\\n    --cookie-jar .data/client/cookies \\\n    --data-binary @- \\\n    "$VOUCH_BASE_URL/api/auth/login" \\\n    --output .data/client/session.json\nunset VOUCH_PASSWORD\nVOUCH_CSRF_TOKEN=$(node -e \'const fs=require("node:fs");process.stdout.write(JSON.parse(fs.readFileSync(".data/client/session.json","utf8")).csrfToken ?? "")\')',
          },
          {
            kind: "text",
            text: "Use the exact configured origin without a trailing slash. Cookie and session files contain private session material and stay under ignored .data. Never share them. The examples below reuse the same shell variables and private cookie file.",
          },
          {
            kind: "code",
            title: "Read a page of workspace summaries",
            language: "shell",
            text: 'curl --fail --cookie .data/client/cookies \\\n  "$VOUCH_BASE_URL/api/overview?limit=50&offset=0"',
          },
          {
            kind: "code",
            title: "Run a read-only provider check with session protection",
            language: "shell",
            text: 'curl --fail --cookie .data/client/cookies \\\n  --header "Origin: $VOUCH_BASE_URL" \\\n  --header "X-Vouch-CSRF: $VOUCH_CSRF_TOKEN" \\\n  --header \'Content-Type: application/json\' \\\n  --data \'{}\' \\\n  "$VOUCH_BASE_URL/api/integrations/bolna/check"',
          },
        ],
      },
      {
        id: "session-endpoints",
        title: "Session and workspace endpoints",
        blocks: [
          {
            kind: "table",
            columns: ["Method and route", "Behavior"],
            rows: [
              [
                "GET /api/auth/session",
                "Read authentication state, user, current workspace, memberships and CSRF value",
              ],
              ["POST /api/auth/login", "Sign in with email and password"],
              [
                "POST /api/auth/logout",
                "Revoke the session and clear its cookie",
              ],
              [
                "POST /api/auth/workspace",
                "Switch to an existing membership using workspaceId",
              ],
              ["POST /api/auth/workspaces", "Create a workspace using name"],
              [
                "GET or POST /api/auth/members",
                "Owner-only listing or member provisioning",
              ],
              [
                "DELETE /api/auth/members/{userId}",
                "Owner-only removal with last-owner protection",
              ],
              [
                "POST /api/auth/password",
                "Rotate currentPassword to newPassword and revoke all user sessions",
              ],
            ],
          },
          {
            kind: "text",
            text: "Before sign-in, the session endpoint returns authenticated false with HTTP 200. Other product reads return 401. The selected workspace comes from the server session, not a client-supplied tenant header. Cross-workspace run identifiers return 404.",
          },
        ],
      },
      {
        id: "workspace-endpoints",
        title: "Workspace endpoints",
        blocks: [
          {
            kind: "table",
            columns: ["Method and route", "Behavior"],
            rows: [
              ["GET /api/health", "Check the API and PostgreSQL connection"],
              [
                "GET /api/overview",
                "Read paginated campaigns with associated runs, global counts and live readiness",
              ],
              [
                "GET /api/findings?search=&outcome=&limit=&offset=",
                "Search all findings in the selected workspace with outcome filtering and server pagination",
              ],
              [
                "POST /api/targets",
                "Register an explicitly authorized operator-allowlisted PSTN target",
              ],
              [
                "POST /api/campaigns",
                "Capture a real live campaign with its registered target and immutable scope",
              ],
              [
                "POST /api/campaigns/{campaignId}/stop",
                "Stop queued work and request active live cancellation",
              ],
            ],
          },
          {
            kind: "text",
            text: "Target creation requires a name, PSTN transport, authorization and an authorization reference. Campaign creation uses the registered target and full validated scope. Overview and findings accept limit from 1 to 100 and a nonnegative offset. Findings filtering happens across the workspace before pagination rather than only within one downloaded page.",
          },
          {
            kind: "text",
            text: "The Findings browser route preserves q, outcome and page in its URL. The API uses search, outcome, limit and offset. The server session determines the workspace. A search cannot read another workspace or create example findings.",
          },
        ],
      },
      {
        id: "run-endpoints",
        title: "Run endpoints",
        blocks: [
          {
            kind: "table",
            columns: ["Method and route", "Behavior"],
            rows: [
              [
                "GET /api/runs/{runId}",
                "Read configuration, evidence, verdict, integrity, review history, safe execution status and artifact metadata",
              ],
              [
                "POST /api/runs/{runId}/review",
                "Review a terminal completed, failed or cancelled candidate violation with a rationale",
              ],
              [
                "POST /api/runs/{runId}/rerun",
                "Reserve a remaining slot under the same captured configuration",
              ],
              [
                "GET /api/runs/{runId}/export",
                "Download the versioned regression JSON artifact",
              ],
              [
                "POST /api/runs/{runId}/reconcile",
                "Owner-only binding of a known existing providerExecutionId for independent worker verification",
              ],
            ],
          },
          {
            kind: "code",
            title: "Inspect and export an existing run",
            language: "shell",
            text: 'read -r -p \'Run UUID \' VOUCH_RUN_ID\ncurl --fail --cookie .data/client/cookies \\\n  "$VOUCH_BASE_URL/api/runs/$VOUCH_RUN_ID"\ncurl --fail --cookie .data/client/cookies \\\n  "$VOUCH_BASE_URL/api/runs/$VOUCH_RUN_ID/export" \\\n  --output vouch-regression.json',
          },
          {
            kind: "text",
            text: "Use the complete run UUID from its evidence page URL. Review requests require a decision of `confirmed` or `dismissed` and a note of 3 to 2000 characters. The export contains the schema version, scenario, captured configuration and digest, expected policy, observed verdict, review history, and realized evidence.",
          },
          {
            kind: "note",
            title: "Export requires evidence",
            text: "Evidence-free runs return HTTP 409. A terminal status without backend observations must not be presented as a verified side effect. Keep unknown outcomes explicit.",
            warning: false,
          },
        ],
      },
      {
        id: "connector-contract",
        title: "Signed connectors and recordings",
        blocks: [
          {
            kind: "table",
            columns: ["Method and route", "Behavior"],
            rows: [
              [
                "GET /api/runs/{runId}/connector-credentials",
                "Owner-only run-scoped backend and provider settings",
              ],
              [
                "POST /api/runs/{runId}/backend-events",
                "Signed ordered backend observations and explicit log completion",
              ],
              [
                "POST /api/runs/{runId}/provider-events",
                "Separately signed transcript and provider observations",
              ],
              [
                "GET /api/runs/{runId}/artifacts",
                "Authenticated recording metadata list",
              ],
              [
                "GET /api/runs/{runId}/artifacts/{artifactId}",
                "Authenticated decrypted audio stream with byte ranges",
              ],
              [
                "DELETE /api/runs/{runId}/artifacts/{artifactId}",
                "Owner-only permanent recording deletion",
              ],
              [
                "POST /api/runs/{runId}/redact-transcript",
                "Owner-only terminal transcript redaction preserving backend facts",
              ],
              [
                "POST /api/runs/{runId}/artifacts/retry",
                "Owner-only recovery of missing final transcript or recording without another call",
              ],
              [
                "POST /api/runs/{runId}/artifacts/redact",
                "Owner-only permanent recording discard, including audio that never arrived",
              ],
            ],
          },
          {
            kind: "text",
            text: "Use Evidence and policies for canonical JSON signing, stream sequences, replay protection and final completeness. Backend and provider keys are distinct. Only correlated actual executions can accept live evidence. The retired shared bearer endpoint cannot bypass signed per-run authentication.",
          },
          {
            kind: "note",
            title: "Unavailable evidence stays unavailable",
            text: "A live connection or completed provider status cannot prove a backend tool result. Only authenticated backend observations establish those facts. Recordings require successful ingestion from an approved host and remain unavailable when missing.",
            warning: false,
          },
        ],
      },
      {
        id: "error-responses",
        title: "Error responses",
        blocks: [
          {
            kind: "table",
            columns: ["Status", "Typical cause"],
            rows: [
              [
                "400",
                "Invalid input or a rejected field value. Inspect the returned validation message.",
              ],
              ["401", "Missing or invalid session or connector credential"],
              [
                "403",
                "Untrusted origin, invalid CSRF, insufficient role or disallowed target",
              ],
              [
                "404",
                "Unknown or inaccessible record, missing artifact or private file",
              ],
              [
                "409",
                "Evidence-free export, conflicting state or incomplete artifact recovery",
              ],
              ["410", "Retired shared evidence ingestion endpoint"],
              ["413", "Request exceeds the configured body limit"],
              ["429", "Rate-limited authentication attempt"],
              ["500", "Unexpected internal service failure"],
              ["503", "Required database or operational service unavailable"],
            ],
          },
          {
            kind: "text",
            text: "The response carries a safe error message. Input errors include stable field messages so a client can identify the rejected control. Read the status and message before retrying a mutation. Provider bodies, credentials and internal stack traces are not public API output.",
          },
        ],
      },
    ],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    group: "Keep moving",
    description:
      "Diagnose the failing service or boundary before retrying a campaign.",
    time: "4 min read",
    sections: [
      {
        id: "workspace-unavailable",
        title: "Workspace unavailable",
        blocks: [
          {
            kind: "text",
            text: "Confirm DATABASE_URL contains the actual intended Supabase PostgreSQL connection and that the project is reachable. Check provider TLS requirements, connection mode and migration-role privileges using docs/operations/supabase.md. Blank placeholders cannot establish a database connection.",
          },
          {
            kind: "code",
            title: "Apply migrations and start configured services",
            language: "shell",
            text: "pnpm db:migrate\npnpm dev",
          },
          {
            kind: "text",
            text: "Docker is required only for an optional local database or container deployment. Do not start duplicate API or worker processes. Never reset retained data to solve an ordinary connection problem.",
          },
        ],
      },
      {
        id: "campaign-stays-queued",
        title: "Campaign stays queued",
        blocks: [
          {
            kind: "text",
            text: "Check the authorized start time and worker heartbeat. Future campaigns remain queued by design. One case runs globally at a time. An unresolved live dispatch or unfinalized cost intentionally holds the slot and reservation rather than permitting a second call. Inspect its execution status before changing the queue.",
          },
          {
            kind: "code",
            title: "Start the worker separately",
            language: "shell",
            text: "pnpm dev:worker",
          },
        ],
      },
      {
        id: "rerun-is-rejected",
        title: "Rerun is rejected",
        blocks: [
          {
            kind: "text",
            text: "A stopped campaign, an expired window, exhausted call slots, or changed captured content prevents a rerun. The first pair reserves two slots and each rerun consumes one more. Create a new authorized campaign to change scope or configuration.",
          },
        ],
      },
      {
        id: "connection-check-fails",
        title: "Connection check fails",
        blocks: [
          {
            kind: "text",
            text: "Confirm the API key is available to the server and that the active network policy allows `api.bolna.ai`. Do not print the key or disable TLS verification. A network failure does not establish that a credential is invalid, and a successful check still does not enable live calls.",
          },
          {
            kind: "text",
            text: "In managed cloud environments, saving an editable configuration draft does not apply its network settings to the running instance. Check the active policy after the environment settings are applied.",
          },
        ],
      },
      {
        id: "evidence-or-audio-missing",
        title: "Evidence or audio is missing",
        blocks: [
          {
            kind: "text",
            text: "Unknown means an observation has not been established. Check the backend stream sequence, actual execution identity, complete-log marker, recording host allowlist and encryption key. Missing audio is never replaced with generated speech. Export returns HTTP 409 when no evidence exists.",
          },
          {
            kind: "text",
            text: "A timed-out evidence request offers retry. Failed background refreshes retain the last fetched evidence with a warning. Tabs pause scheduled polling while hidden and refresh when visible again.",
          },
        ],
      },
      {
        id: "session-or-workspace-access",
        title: "Session or workspace access",
        blocks: [
          {
            kind: "text",
            text: "A 401 requires signing in again. A 403 can mean an untrusted Origin, missing CSRF value or insufficient owner role. Refresh session state after signing in and keep the cookie jar and CSRF value together for command-line requests. A 404 for a known identifier can mean it belongs to another workspace.",
          },
          {
            kind: "text",
            text: "Switch workspaces through the workspace control. Password changes revoke all sessions. An owner can provision access without an email service. Production requires session mode and HTTPS. Supabase database credentials are separate from the application owner password.",
          },
        ],
      },
      {
        id: "operations-and-recovery",
        title: "Retention and recovery",
        blocks: [
          {
            kind: "text",
            text: "Schedule bounded retention and monitor failures. Expired recordings and sessions can be cleaned separately from campaign evidence. Unresolved calls and unsettled costs remain held rather than expiring solely due to age.",
          },
          {
            kind: "text",
            text: "For Supabase, use provider-supported database backup and restore procedures alongside a consistent encrypted-artifact backup. Keep encryption keys separately protected and stop all writers when taking a coordinated snapshot. Local Docker database scripts are not a substitute for a Supabase recovery plan.",
          },
          {
            kind: "note",
            title: "Validate recovery before customer use",
            text: "Exercise database restoration, recording decryption, workspace isolation and provider reconciliation on an isolated destination. A static build or placeholder connection does not validate disaster recovery.",
            warning: true,
          },
        ],
      },
    ],
  },
];

function guidePath(guide: Guide) {
  return guide.slug ? `/docs/${guide.slug}` : "/docs";
}
function Inline({ text }: { text: string }) {
  return text
    .split(/(`[^`]+`)/g)
    .map((part, index) =>
      part.startsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}
async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Fall back to a selection when browser clipboard access is denied. */
  }
  const previous = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.cssText =
    "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.append(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
  return copied;
}
type CopyState = "idle" | "copied" | "failed";
function useCopy(text: string) {
  const [state, setState] = useState<CopyState>("idle");
  useEffect(() => {
    if (state !== "copied") return;
    const timer = setTimeout(() => setState("idle"), 2400);
    return () => clearTimeout(timer);
  }, [state]);
  const copy = async () =>
    setState((await copyText(text)) ? "copied" : "failed");
  return { state, copy };
}
function CopyFeedback({ state }: { state: CopyState }) {
  return (
    <span className="docs-copy-status" role="status">
      {state === "failed"
        ? "Copy was blocked. Select the command and copy it manually."
        : state === "copied"
          ? "Copied to clipboard"
          : ""}
    </span>
  );
}
function CodeBlock({ block }: { block: Extract<Block, { kind: "code" }> }) {
  const { state, copy } = useCopy(block.text);
  return (
    <figure className="docs-code">
      <figcaption>
        <span>
          <TerminalWindowIcon size={15} />
          {block.title}
        </span>
        <div>
          <small>{block.language}</small>
          <button
            type="button"
            onClick={copy}
            aria-label={`Copy ${block.title}`}
          >
            {state === "copied" ? (
              <CheckIcon size={15} />
            ) : (
              <CopyIcon size={15} />
            )}
            <span>{state === "copied" ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </figcaption>
      <pre tabIndex={0} aria-label={block.title}>
        <code>{block.text}</code>
      </pre>
      <CopyFeedback state={state} />
    </figure>
  );
}
function DocTable({ block }: { block: Extract<Block, { kind: "table" }> }) {
  return (
    <div className="docs-table-scroll" tabIndex={0}>
      <table>
        <thead>
          <tr>
            {block.columns.map((column) => (
              <th scope="col" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td key={index}>
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function DocNote({ block }: { block: Extract<Block, { kind: "note" }> }) {
  const Icon = block.warning ? WarningCircleIcon : InfoIcon;
  return (
    <div className={`docs-note ${block.warning ? "warning" : ""}`} role="note">
      <Icon size={19} />
      <div>
        <strong>{block.title}</strong>
        <p>
          <Inline text={block.text} />
        </p>
      </div>
    </div>
  );
}
function DocBlock({ block }: { block: Block }) {
  if (block.kind === "text")
    return (
      <p>
        <Inline text={block.text} />
      </p>
    );
  if (block.kind === "code") return <CodeBlock block={block} />;
  if (block.kind === "table") return <DocTable block={block} />;
  if (block.kind === "note") return <DocNote block={block} />;
  const List = block.ordered ? "ol" : "ul";
  return (
    <List>
      {block.items.map((item) => (
        <li key={item}>
          <Inline text={item} />
        </li>
      ))}
    </List>
  );
}
function searchableText(guide: Guide) {
  return [
    guide.title,
    guide.description,
    ...guide.sections.map(
      (section) => `${section.title} ${JSON.stringify(section.blocks)}`,
    ),
  ]
    .join(" ")
    .toLowerCase();
}
type SearchProps = { query: string; setQuery: (query: string) => void };
function DocsSearch({ query, setQuery }: SearchProps) {
  return (
    <label className="docs-search">
      <MagnifyingGlassIcon size={17} />
      <span className="sr-only">Search documentation</span>
      <input
        type="search"
        placeholder="Search the docs"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query && (
        <button
          aria-label="Clear documentation search"
          onClick={() => setQuery("")}
        >
          <XIcon size={15} />
        </button>
      )}
    </label>
  );
}
function ChapterLink({
  item,
  active,
  navigate,
}: {
  item: Guide;
  active: boolean;
  navigate: Navigate;
}) {
  return (
    <Link
      to={guidePath(item)}
      navigate={navigate}
      className={active ? "is-active" : ""}
      aria-current={active ? "page" : undefined}
    >
      {item.title}
      {active && <span className="docs-nav-dot" />}
    </Link>
  );
}
function NavigationGroup({
  group,
  visible,
  activeSlug,
  navigate,
}: {
  group: string;
  visible: Guide[];
  activeSlug: string | undefined;
  navigate: Navigate;
}) {
  return (
    <div className="docs-nav-group">
      <span>{group}</span>
      {visible
        .filter((item) => item.group === group)
        .map((item) => (
          <ChapterLink
            key={item.slug}
            item={item}
            active={item.slug === activeSlug}
            navigate={navigate}
          />
        ))}
    </div>
  );
}
function SearchFeedback({
  count,
  query,
  setQuery,
}: SearchProps & { count: number }) {
  if (!count)
    return (
      <div className="docs-no-results">
        <strong>No matching guides</strong>
        <p>Try a feature name or setting.</p>
        <button onClick={() => setQuery("")}>Clear search</button>
      </div>
    );
  if (!query) return null;
  return (
    <p className="docs-search-count" role="status">
      {count} {count === 1 ? "guide" : "guides"} found
    </p>
  );
}
function DocsNavigation({
  guide,
  query,
  setQuery,
  navigate,
  open,
}: {
  guide?: Guide;
  query: string;
  setQuery: (query: string) => void;
  navigate: Navigate;
  open: boolean;
}) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = guides.filter((item) =>
    words.every((word) => searchableText(item).includes(word)),
  );
  const groups = [...new Set(visible.map((item) => item.group))];
  return (
    <aside
      className={`docs-navigation ${open ? "is-open" : ""}`}
      id="docs-navigation"
      aria-label="Documentation navigation"
    >
      <DocsSearch query={query} setQuery={setQuery} />
      <nav aria-label="Documentation chapters">
        {groups.map((group) => (
          <NavigationGroup
            key={group}
            group={group}
            visible={visible}
            activeSlug={guide?.slug}
            navigate={navigate}
          />
        ))}
      </nav>
      <SearchFeedback
        count={visible.length}
        query={query}
        setQuery={setQuery}
      />
      <a
        className="docs-source"
        href="https://github.com/MokiMeow/Vouch"
        target="_blank"
        rel="noreferrer"
      >
        <GithubLogoIcon size={18} />
        <span>Explore the source</span>
        <ArrowUpRightIcon size={15} />
      </a>
    </aside>
  );
}
function useCurrentSection(guide: Guide) {
  const [active, setActive] = useState(guide.sections[0]?.id ?? "");
  useEffect(() => {
    setActive(guide.sections[0]?.id ?? "");
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-110px 0px -65% 0px" },
    );
    document
      .querySelectorAll(".docs-article h2[id]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [guide]);
  return active;
}
function DocContents({ guide }: { guide: Guide }) {
  const active = useCurrentSection(guide);
  return (
    <aside className="docs-contents" aria-label="Article contents">
      <span>On this page</span>
      <nav aria-label="On this page">
        {guide.sections.map((section) => (
          <a
            href={`#${section.id}`}
            key={section.id}
            aria-current={active === section.id ? "location" : undefined}
          >
            {section.title}
          </a>
        ))}
      </nav>
      <div className="docs-reading-note">
        <BookOpenIcon size={17} />
        <p>
          Authorize the target.
          <br />
          Keep the evidence.
        </p>
      </div>
    </aside>
  );
}
function GuidePagination({
  guide,
  navigate,
}: {
  guide: Guide;
  navigate: Navigate;
}) {
  const index = guides.indexOf(guide);
  const previous = guides[index - 1],
    next = guides[index + 1];
  return (
    <nav className="docs-pagination" aria-label="Adjacent guides">
      {previous ? (
        <Link to={guidePath(previous)} navigate={navigate}>
          <ArrowLeftIcon size={19} />
          <span>
            <small>Previous guide</small>
            {previous.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link to={guidePath(next)} navigate={navigate}>
          <span>
            <small>Next guide</small>
            {next.title}
          </span>
          <ArrowRightIcon size={19} />
        </Link>
      ) : (
        <Link to="/app" navigate={navigate}>
          <span>
            <small>Ready to begin</small>Open the workspace
          </span>
          <ArrowRightIcon size={19} />
        </Link>
      )}
    </nav>
  );
}
function GuideArticle({
  guide,
  navigate,
}: {
  guide: Guide;
  navigate: Navigate;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [guide]);
  return (
    <main className="docs-article" id="docs-main">
      <div className="docs-article-meta">
        <span>{guide.group}</span>
        <span>{guide.time}</span>
      </div>
      <div className="docs-title-row">
        <div>
          <h1 tabIndex={-1} ref={heading}>
            {guide.title}
          </h1>
          <p className="docs-lead">{guide.description}</p>
        </div>
      </div>
      {guide.slug === "" && (
        <div className="docs-welcome-line">
          <span className="docs-live-dot" />
          <span>Real calls only</span>
          <span>Private setup required</span>
        </div>
      )}
      <div className="docs-sections">
        {guide.sections.map((section, index) => (
          <section key={section.id}>
            <div className="docs-section-heading">
              <span aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 id={section.id}>{section.title}</h2>
              <a
                href={`#${section.id}`}
                aria-label={`Link to ${section.title}`}
              >
                #
              </a>
            </div>
            {section.blocks.map((block, i) => (
              <DocBlock block={block} key={i} />
            ))}
          </section>
        ))}
      </div>
      <GuidePagination guide={guide} navigate={navigate} />
      <footer className="docs-article-footer">
        <span>Built around recorded evidence</span>
        <span>Vouch documentation</span>
      </footer>
    </main>
  );
}
function DocsHeader({ navigate }: { navigate: Navigate }) {
  return (
    <header className="docs-header">
      <div>
        <Brand navigate={navigate} />
        <span className="docs-header-divider" />
        <Link
          to="/docs"
          navigate={navigate}
          className="docs-header-current"
          aria-current="page"
        >
          Docs
        </Link>
        <span className="docs-version">v0.1</span>
      </div>
      <nav aria-label="Documentation website">
        <Link to="/" navigate={navigate}>
          Home
        </Link>
        <Link to="/app" navigate={navigate} className="docs-workspace-link">
          Workspace <ArrowUpRightIcon size={15} />
        </Link>
      </nav>
    </header>
  );
}
function MissingGuide({ navigate }: { navigate: Navigate }) {
  return (
    <main className="docs-article docs-missing" id="docs-main">
      <BookOpenIcon size={30} />
      <h1>Guide not found</h1>
      <p>Choose a chapter from the navigation or return to the introduction.</p>
      <Link to="/docs" navigate={navigate} className="docs-return">
        Read the introduction <ArrowRightIcon size={17} />
      </Link>
    </main>
  );
}
function guideTitle(guide: Guide | undefined, fallback: string) {
  if (guide) return guide.title;
  return fallback;
}
export function Docs({ path, navigate }: { path: string; navigate: Navigate }) {
  const slug = path.replace(/^\/docs\/?/, "").replace(/\/$/, "");
  const guide = guides.find((item) => item.slug === slug);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.title = `${guideTitle(guide, "Guide not found")} | Vouch docs`;
    setOpen(false);
  }, [guide, path]);
  return (
    <div className="docs-app">
      <a href="#docs-main" className="skip-link">
        Skip to documentation
      </a>
      <DocsHeader navigate={navigate} />
      <nav
        className="docs-mobile-bar"
        aria-label="Documentation navigation toggle"
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls="docs-navigation"
          onClick={() => setOpen(!open)}
        >
          <BookOpenIcon size={17} />
          <span>{guideTitle(guide, "Documentation")}</span>
          <CaretDownIcon size={15} />
        </button>
      </nav>
      <div className="docs-layout">
        <DocsNavigation
          guide={guide}
          query={query}
          setQuery={setQuery}
          navigate={navigate}
          open={open}
        />
        {guide ? (
          <>
            <GuideArticle guide={guide} navigate={navigate} />
            <DocContents guide={guide} />
          </>
        ) : (
          <MissingGuide navigate={navigate} />
        )}
      </div>
    </div>
  );
}
