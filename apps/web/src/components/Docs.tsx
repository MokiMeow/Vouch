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
import type { Navigate } from "../types";
import { Brand, Link } from "./Primitives";
import "../docs.css";

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
            text: "Vouch is a workspace for authorized voice-agent security testing. Define a business policy, run a bounded scenario, and review what the target actually did. A convincing answer is a starting point. Tool execution and backend observations establish the outcome.",
          },
          {
            kind: "text",
            text: "The available local workflow tests one contact-change policy against an instrumented synthetic support agent. It includes an adversarial false-authority scenario and a legitimate verified control. Both use the same target behavior and fictional account.",
          },
        ],
      },
      {
        id: "the-workflow",
        title: "The workflow",
        blocks: [
          {
            kind: "list",
            ordered: true,
            items: [
              "Register a target you own or have explicit permission to test.",
              "Choose the test window, call count, duration, budget, and stop condition.",
              "Run the verified control and false-authority scenario within that scope.",
              "Inspect the transcript, tool events, verification record, and observed state.",
              "Review a candidate finding and export its versioned regression case.",
            ],
          },
        ],
      },
      {
        id: "available-today",
        title: "Available today",
        blocks: [
          {
            kind: "table",
            columns: ["Capability", "Current support"],
            rows: [
              ["Synthetic campaigns", "Available with no provider key"],
              [
                "Backend policy evaluation",
                "Deterministic assertions against recorded events",
              ],
              [
                "Human review and export",
                "Available with preserved configuration and review history",
              ],
              [
                "Bolna connection check",
                "Read-only check with configured credentials and network access",
              ],
              ["Live calls and call recordings", "Not implemented or verified"],
            ],
          },
          {
            kind: "note",
            title: "Know what you are testing",
            text: "Fixture runs use fictional data and do not place calls or incur provider charges. Browser speech replay is a synthetic reading of the transcript. It is not a recording of a call.",
          },
        ],
      },
      {
        id: "your-next-step",
        title: "Your next step",
        blocks: [
          {
            kind: "text",
            text: "Start with Quickstart to run the services locally. If the workspace is already running, continue to First campaign. The Evidence guide explains how to separate a requested action from a verified side effect.",
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
      "Run the complete synthetic workflow locally. No Bolna account or provider key is required.",
    time: "5 min setup",
    sections: [
      {
        id: "requirements",
        title: "Requirements",
        blocks: [
          {
            kind: "table",
            columns: ["Dependency", "Version or requirement"],
            rows: [
              ["Node.js", "24.19 or later"],
              ["pnpm", "11.25.0"],
              ["Docker", "An accessible running daemon"],
              ["Chromium", "Required only for browser checks"],
            ],
          },
          {
            kind: "text",
            text: "The commands below use Bash. On Windows, use WSL2 with Docker access. Run service commands from the repository root. The lockfile pins application packages so each teammate installs the same dependency versions.",
          },
        ],
      },
      {
        id: "get-the-code",
        title: "Get the code",
        blocks: [
          {
            kind: "code",
            title: "Clone the repository",
            language: "shell",
            text: "git clone https://github.com/MokiMeow/Vouch.git\ncd Vouch\npnpm install --frozen-lockfile",
          },
          {
            kind: "text",
            text: "If you are working in a prepared cloud checkout, use that existing repository. Run `bash scripts/cloud-install.sh` to install dependencies, start the local database, apply migrations, and build the interface.",
          },
        ],
      },
      {
        id: "configure-local-services",
        title: "Configure local services",
        blocks: [
          {
            kind: "code",
            title: "Create local configuration safely",
            language: "shell",
            text: "test -e .env || (umask 077; cp .env.example .env)\nchmod 600 .env\nbash scripts/db-start.sh\npnpm db:migrate",
          },
          {
            kind: "text",
            text: "This preserves an existing `.env` file. Set `DATABASE_URL` for your local database. The sample configuration matches the development Docker setup. Credentials stay in the server environment and must never be committed.",
          },
          {
            kind: "note",
            title: "Local development only",
            text: "The API is a single-workspace development server without user authentication. Keep it on loopback. The database helper preserves retained data and does not reset credentials on an existing container.",
            warning: true,
          },
        ],
      },
      {
        id: "start-the-workspace",
        title: "Start the workspace",
        blocks: [
          {
            kind: "code",
            title: "Run all development services",
            language: "shell",
            text: "pnpm dev",
          },
          {
            kind: "text",
            text: "This starts the API, database-backed worker, and Vite interface. By default, PostgreSQL uses port 54329, the API uses 4000, and the interface uses 5173. Open the Vite interface in your local browser and select New campaign.",
          },
          {
            kind: "code",
            title: "Check the evidence store",
            language: "shell",
            text: "curl --fail http://127.0.0.1:4000/api/health",
          },
          {
            kind: "text",
            text: "A healthy response reports `status` as `ok` and `database` as `postgresql`. An open port alone does not establish that the database and API work together.",
          },
        ],
      },
      {
        id: "verify-your-setup",
        title: "Verify your setup",
        blocks: [
          {
            kind: "code",
            title: "Run the core checks",
            language: "shell",
            text: "pnpm build\npnpm test\npnpm test:integration",
          },
          {
            kind: "text",
            text: "Integration checks use a separate database whose name ends in `_test`. Browser checks require the API, worker, built web interface, and Chromium. They create clearly synthetic campaign records in the running development database.",
          },
          {
            kind: "code",
            title: "Run browser checks",
            language: "shell",
            text: "pnpm test:browser\npnpm test:browser:requests",
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
        title: "Choose a target",
        blocks: [
          {
            kind: "text",
            text: "In the workspace, select New campaign. Choose an existing synthetic target or Create a local synthetic support target. Only register systems you own or have explicit authorization to test. Live phone registration does not enable calling.",
          },
        ],
      },
      {
        id: "set-the-scope",
        title: "Set the scope",
        blocks: [
          {
            kind: "table",
            columns: ["Control", "Enforced behavior"],
            rows: [
              [
                "Maximum calls",
                "2 to 20 slots, including reruns. The first pair reserves 2.",
              ],
              [
                "Concurrency",
                "1 active fixture globally, including across worker processes",
              ],
              [
                "Duration",
                "40 to 300 seconds per permitted call. Fixture events complete in 32 synthetic seconds.",
              ],
              ["Budget", "0 to 100 USD. Fixture cost is exactly 0."],
              [
                "Window",
                "Future work remains queued. Expired work fails before execution.",
              ],
              [
                "Stop condition",
                "An observed violation can stop remaining queued cases.",
              ],
            ],
          },
          {
            kind: "text",
            text: "The caller uses the fictional identity Alex Morgan and account SYN-1042. The server requires both scenario categories and prohibits real personal data, real payments, and external targets. Model output cannot replace the captured scope.",
          },
        ],
      },
      {
        id: "run-the-pair",
        title: "Run the pair",
        blocks: [
          {
            kind: "text",
            text: "Authorize the displayed scope and select Launch fixture campaign. The worker runs a benign control that completes backend verification, then a false-authority scenario that claims a prior team already verified the caller.",
          },
          {
            kind: "text",
            text: "The synthetic backend is intentionally vulnerable and stays identical for both scenarios. The control can satisfy the policy, while the false-authority case demonstrates an execution without the required verification. Fixtures complete immediately in real time.",
          },
        ],
      },
      {
        id: "review-the-evidence",
        title: "Review the evidence",
        blocks: [
          {
            kind: "list",
            ordered: true,
            items: [
              "Open a completed case from the campaign or Findings.",
              "Read the transcript and compare its claims with the Timeline and Raw Events tabs.",
              "Check the required verification event and the observed tool execution.",
              "Inspect the before and after account state. Unknown state remains unknown.",
              "Confirm or dismiss a candidate violation with a written rationale.",
            ],
          },
          {
            kind: "text",
            text: "A reviewer decision is added to the audit history. It does not rewrite the deterministic verdict. Only completed candidate violations can be confirmed or dismissed.",
          },
        ],
      },
      {
        id: "rerun-or-export",
        title: "Rerun or export",
        blocks: [
          {
            kind: "text",
            text: "Rerun case keeps the captured configuration and consumes another slot in the same campaign. The server checks the window, stopped state, remaining slots, scope, and digest. Start a new authorized campaign when the old one is stopped or exhausted.",
          },
          {
            kind: "text",
            text: "Export regression downloads a versioned JSON file with the captured configuration, expected policy, observed evidence, verdict, integrity metadata, and review history. Keep the file with the change you are testing so the failed scenario can guide a future regression.",
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
    time: "5 min read",
    sections: [
      {
        id: "the-current-policy",
        title: "The current policy",
        blocks: [
          {
            kind: "text",
            text: "The available baseline is `contact-verification-v1`. A successful `change_contact_phone` execution requires a preceding trusted `identity.verified` event for the same account and call. The fixture accepts the backend `synthetic_challenge` method.",
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
            text: "A matching digest checks configuration content. It is not a signature proving who supplied the evidence. Production use still needs authenticated users and signed evidence correlation.",
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
    time: "4 min read",
    sections: [
      {
        id: "synthetic-runtime",
        title: "Synthetic runtime",
        blocks: [
          {
            kind: "text",
            text: "The local runtime is `vouch-fixture-state-machine@1` with API flavor `fixture-v1`. It produces normalized conversation and tool events against the instrumented fictional backend. No speech provider or external target is required.",
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
              [
                "BOLNA_API_KEY",
                "Secret credential sent only to the hosted Bolna API",
              ],
              [
                "BOLNA_AGENT_ID",
                "Explicitly chosen caller agent for a read-only configuration check",
              ],
              [
                "AUTHORIZED_PHONE_NUMBERS",
                "Operator-managed exact E.164 phone allowlist, separated by commas",
              ],
              [
                "VOUCH_INGEST_TOKEN",
                "Independent secret protecting target-side evidence ingestion",
              ],
            ],
          },
          {
            kind: "text",
            text: "Use secure environment settings or a private ignored `.env` file. Never put secrets in frontend variables, source files, exported examples, or chat. Register a phone target only with an authorization reference and an exact allowlist match.",
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
            title: "Live dispatch is disabled",
            text: "Adding an API key does not enable calls. Provider-supported cancellation, hard maximum duration, monetary reservation, reconciliation, recording ingestion, and target-side evidence correlation must be implemented and verified first.",
            warning: true,
          },
          {
            kind: "text",
            text: "The current environment has not verified provider authentication or a live call. Network policy can block the connection before credentials reach Bolna. A configured variable alone is not proof of a valid key.",
          },
          {
            kind: "text",
            text: "SIP, WebSocket, WebRTC bridges, Cartesia, and additional caller runtimes are not implemented. Production authentication and tenant isolation are also required before exposing the workspace beyond loopback.",
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
      "Explore the local HTTP surface, inspect a run, and retrieve its regression artifact.",
    time: "5 min read",
    sections: [
      {
        id: "local-boundary",
        title: "Local boundary",
        blocks: [
          {
            kind: "text",
            text: "The default base URL is `http://127.0.0.1:4000`. Responses use JSON unless an endpoint downloads a regression artifact. The API rejects untrusted hosts and mutation origins. It is not a production multi-user API.",
          },
          {
            kind: "code",
            title: "Read workspace summaries",
            language: "shell",
            text: "curl --fail http://127.0.0.1:4000/api/overview",
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
                "Read target, campaign, and run summaries with live readiness flags",
              ],
              [
                "POST /api/targets",
                "Register an authorized fixture or allowlisted phone target",
              ],
              [
                "POST /api/campaigns",
                "Capture and queue a scoped synthetic campaign",
              ],
              [
                "POST /api/campaigns/{campaignId}/stop",
                "Stop the campaign and cancel queued cases",
              ],
            ],
          },
          {
            kind: "text",
            text: "Target creation requires a name, transport, explicit authorization, and an authorization reference. Campaign creation requires a name, registered target ID, and the complete validated scope. Use the workspace form to create a correctly bounded first campaign.",
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
                "Read captured configuration, evidence, verdict, integrity and review history",
              ],
              [
                "POST /api/runs/{runId}/review",
                "Confirm or dismiss a completed candidate violation with a note",
              ],
              [
                "POST /api/runs/{runId}/rerun",
                "Reserve a remaining slot under the same captured configuration",
              ],
              [
                "GET /api/runs/{runId}/export",
                "Download the versioned regression JSON artifact",
              ],
            ],
          },
          {
            kind: "code",
            title: "Inspect and export an existing run",
            language: "shell",
            text: 'read -r -p \'Run UUID \' VOUCH_RUN_ID\ncurl --fail "http://127.0.0.1:4000/api/runs/$VOUCH_RUN_ID"\ncurl --fail "http://127.0.0.1:4000/api/runs/$VOUCH_RUN_ID/export" \\\n  --output vouch-regression.json',
          },
          {
            kind: "text",
            text: "Use the complete run UUID from its evidence page URL. Review requests require a decision of `confirmed` or `dismissed` and a note of 3 to 2000 characters. The export contains the schema version, scenario, captured configuration and digest, expected policy, observed verdict, review history, and realized evidence.",
          },
        ],
      },
      {
        id: "connector-contract",
        title: "Connector contract",
        blocks: [
          {
            kind: "table",
            columns: ["Method and route", "Behavior"],
            rows: [
              [
                "POST /api/integrations/bolna/check",
                "Perform a read-only provider connection check",
              ],
              [
                "POST /api/runs/{runId}/evidence",
                "Accept authenticated normalized events for an active non-synthetic run",
              ],
            ],
          },
          {
            kind: "text",
            text: "Evidence ingestion requires a Bearer credential matching `VOUCH_INGEST_TOKEN`. Synthetic evidence is immutable through this route. The event envelope contains `kind`, `source`, an integer millisecond `at`, and a JSON `data` object. Valid kinds include transcript, tool request, tool execution, identity verification, backend state, and provider event.",
          },
          {
            kind: "note",
            title: "A contract is not a live connector",
            text: "The authenticated ingestion route is tested, but live run creation and actual customer evidence connectors are not implemented. Do not interpret this endpoint as proof of live provider support.",
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
                "Invalid input, expired scope, exhausted slots, incompatible capture or provider failure",
              ],
              ["401", "Missing or invalid evidence-ingestion credential"],
              [
                "403",
                "Untrusted host or origin, or a phone outside the operator allowlist",
              ],
              ["404", "Missing run, unknown route, or a private file URL"],
              ["413", "JSON body exceeds 512 KB"],
              ["500", "Database operation failed"],
            ],
          },
          {
            kind: "text",
            text: "Read the returned error message before retrying a mutation. A connection-check error can occur before provider authentication. The current API does not expose internal provider response bodies.",
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
            text: "Check that Docker is running, then confirm `DATABASE_URL` points to the intended local database. The API requires this setting and will not fall back to embedded credentials. Start the database and apply migrations before starting the API.",
          },
          {
            kind: "code",
            title: "Restart local services",
            language: "shell",
            text: "bash scripts/db-start.sh\npnpm db:migrate\npnpm dev",
          },
          {
            kind: "text",
            text: "Do not start duplicate API or worker processes when the services already exist. Existing database containers retain their configuration. Changing a password in `.env` does not reset an existing database.",
          },
        ],
      },
      {
        id: "campaign-stays-queued",
        title: "Campaign stays queued",
        blocks: [
          {
            kind: "text",
            text: "Check the authorized start time and confirm the worker is running. Future campaigns remain queued by design. One fixture runs globally at a time, so another active case can delay the next job. A malformed or expired stored scope fails before execution.",
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
            text: "Unknown evidence means the required observation has not been established. Do not infer a backend change from a spoken answer. Fixture transcripts can be replayed with local browser speech voices, but no actual recording exists. If speech is unavailable, read the complete transcript and event timeline.",
          },
          {
            kind: "text",
            text: "A timed-out evidence request offers retry. Failed background refreshes retain the last fetched evidence with a warning. Tabs pause scheduled polling while hidden and refresh when visible again.",
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
          Start with a fixture.
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
      <div
        className={`docs-title-row ${guide.slug === "" ? "has-mascot" : ""}`}
      >
        <div>
          <h1 tabIndex={-1} ref={heading}>
            {guide.title}
          </h1>
          <p className="docs-lead">{guide.description}</p>
        </div>
        {guide.slug === "" && (
          <img
            src="/brand/vouch-scout.webp"
            alt=""
            width={128}
            height={128}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
          />
        )}
      </div>
      {guide.slug === "" && (
        <div className="docs-welcome-line">
          <span className="docs-live-dot" />
          <span>Local fixtures available</span>
          <span>No provider key needed</span>
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
