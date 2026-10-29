import {
  ArrowDownIcon,
  CodeIcon,
  HeadphonesIcon,
  InfoIcon,
  LockSimpleIcon,
  ShieldCheckIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { useRef, useState, type KeyboardEvent } from "react";
import type { CapturedPolicy } from "../../../../../packages/core/src/schemas";
import { api, ApiError, label } from "../../shared/lib";
import { useWorkspaceSession } from "../auth/Auth";
import type {
  EvidenceEvent,
  RecordingArtifact,
  Run,
  Verdict,
} from "../../shared/types";
import { Badge } from "../../shared/ui/Primitives";
function Utterance({
  event,
  callerLabel,
}: {
  event: EvidenceEvent;
  callerLabel: string;
}) {
  const caller = event.source === "caller";
  const providerTranscript =
    event.data.format === "provider_transcript" ||
    event.source === "provider" ||
    event.data.timestampGranularity === "execution";
  if (providerTranscript)
    return (
      <article className="provider-transcript">
        <h3>Provider transcript</h3>
        <p className="muted small">Speaker timing was not supplied.</p>
        <p className="transcript-text">{String(event.data.text ?? "")}</p>
      </article>
    );
  return (
    <article className={`utterance ${caller ? "caller" : ""}`}>
      <span className="speaker-avatar">
        {caller ? <HeadphonesIcon size={18} /> : <WaveformIcon size={18} />}
      </span>
      <div>
        <div className="speaker">
          <strong>
            {caller
              ? callerLabel
              : event.source === "target"
                ? "Target agent"
                : "Transcript observation"}
          </strong>
          {event.data.timestampKnown !== false && (
            <time>{Math.floor(event.at / 1000)}s</time>
          )}
        </div>
        <p>{String(event.data.text ?? "")}</p>
      </div>
    </article>
  );
}
function Transcript({
  events,
  scenario,
}: {
  events: EvidenceEvent[];
  scenario: string;
}) {
  if (!events.length)
    return <p className="muted">Transcript not available yet.</p>;
  const callerLabel =
    scenario === "benign_control"
      ? "Benign control caller"
      : "Adversarial caller";
  return (
    <div className="transcript">
      {events.map((e) => (
        <Utterance event={e} callerLabel={callerLabel} key={e.id} />
      ))}
    </div>
  );
}
function evidenceValue(value: unknown, fallback = "Unknown") {
  return value === null || value === undefined ? fallback : String(value);
}
function requestedPhone(event: EvidenceEvent) {
  const args = event.data.arguments;
  if (!args || typeof args !== "object") return "Unknown";
  return evidenceValue((args as Record<string, unknown>).phone);
}
function eventDescription(event: EvidenceEvent) {
  if (event.data.text) return String(event.data.text);
  if (event.kind === "backend.state")
    return `${evidenceValue(event.data.before)} → ${evidenceValue(event.data.after)}`;
  if (event.kind === "tool.requested")
    return `${String(event.data.tool)} → ${requestedPhone(event)}`;
  return JSON.stringify(event.data);
}
function Timeline({ events }: { events: EvidenceEvent[] }) {
  return (
    <div className="timeline">
      {events.map((e) => (
        <article
          className={`timeline-event ${e.source === "backend" ? "backend" : ""}`}
          key={e.id}
        >
          <span className="timeline-dot" />
          <time>
            {e.source === "provider" ||
            e.data.timestampKnown === false ||
            e.data.timestampGranularity === "execution"
              ? "Provider observation"
              : `${Math.floor(e.at / 1000)}s`}
          </time>
          <div>
            <div className="timeline-title">
              <strong>{label(e.kind)}</strong>
              <Badge>{e.source}</Badge>
            </div>
            <p>{eventDescription(e)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
const tabs = ["conversation", "timeline", "raw events"];
export function ConversationSection({
  run,
  onUpdate,
}: {
  run: Run;
  onUpdate: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const events = run.events ?? [],
    transcript = events.filter((e) => e.kind === "transcript");
  function keydown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % 3,
      ArrowLeft: (index + 2) % 3,
      Home: 0,
      End: 2,
    };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setSelected(next);
    refs.current[next]?.focus();
  }
  const panels = [
    <Transcript key="transcript" events={transcript} scenario={run.scenario} />,
    <Timeline key="timeline" events={events} />,
    <pre key="raw" className="raw-events">
      {JSON.stringify(events, null, 2)}
    </pre>,
  ];
  return (
    <section className="conversation-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">01 / THE CONVERSATION</span>
          <h2>Every word, in context.</h2>
        </div>
        <Badge>Provider evidence</Badge>
      </div>
      <RecordedAudio run={run} onUpdate={onUpdate} />
      <div className="tabs" role="tablist" aria-label="Evidence views">
        {tabs.map((tab, i) => (
          <button
            id={`tab-${i}`}
            aria-controls={`panel-${i}`}
            role="tab"
            aria-selected={selected === i}
            tabIndex={selected === i ? 0 : -1}
            ref={(el) => {
              refs.current[i] = el;
            }}
            onKeyDown={(e) => keydown(e, i)}
            key={tab}
            className={selected === i ? "selected" : ""}
            onClick={() => setSelected(i)}
          >
            {label(tab)}
            {i === 2 && <span>{events.length}</span>}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${selected}`}
        aria-labelledby={`tab-${selected}`}
        tabIndex={0}
        className="evidence-panel"
      >
        {panels[selected]}
      </div>
    </section>
  );
}
function StateChange({ event }: { event: EvidenceEvent }) {
  return (
    <div className="state-diff">
      <div>
        <code>
          accounts.{evidenceValue(event.data.accountId, "unknown")}
          .contact_phone
        </code>
        <Badge tone="violet">Observed state</Badge>
      </div>
      <div className="state-before">
        <span>BEFORE</span>
        <code>{evidenceValue(event.data.before)}</code>
      </div>
      <ArrowDownIcon size={17} className="state-arrow" />
      <div className="state-after">
        <span>AFTER</span>
        <code>{evidenceValue(event.data.after)}</code>
      </div>
      <p>
        <ShieldCheckIcon size={17} />
        Reported by the target’s signed backend evidence connector
      </p>
    </div>
  );
}
export function BackendSection({ events }: { events: EvidenceEvent[] }) {
  const states = events.filter(
    (e) => e.kind === "backend.state" && e.source === "backend",
  );
  return (
    <section className="backend-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">02 / THE OUTCOME</span>
          <h2>Beyond “done.”</h2>
        </div>
        <CodeIcon size={23} weight="light" />
      </div>
      {states.length ? (
        states.map((e) => <StateChange event={e} key={e.id} />)
      ) : (
        <p className="empty-evidence">
          Backend state evidence is unknown. No side effect is inferred from the
          conversation.
        </p>
      )}
    </section>
  );
}
function verificationLabel(v: Verdict | undefined) {
  if (!v) return "Unknown";
  if (v.verificationObserved) return "Observed";
  return v.outcome === "unknown" ? "Unknown" : "Not observed";
}
function changeLabel(changed: boolean | null | undefined) {
  if (changed === true) return "Verified";
  if (changed === false) return "No change observed";
  return "Unknown";
}
function policyChecks(v: Verdict | undefined) {
  if (!v)
    return [
      ["Verification precondition", "Unknown"],
      ["Tool requested", "Unknown"],
      ["Tool executed", "Unknown"],
      ["Durable state change", "Unknown"],
    ];
  return [
    ["Verification precondition", verificationLabel(v)],
    ["Tool requested", v.requested ? "Yes" : "Unknown"],
    ["Tool executed", v.executed ? "Yes" : "Unknown"],
    ["Durable state change", changeLabel(v.stateChanged)],
  ];
}
export function PolicySection({
  verdict,
  policy,
}: {
  verdict: Verdict | undefined;
  policy: CapturedPolicy | undefined;
}) {
  return (
    <section className="policy-section">
      <div className="section-heading">
        <h2>Policy check</h2>
        <span className="mono">v{policy?.version ?? "?"}</span>
      </div>
      <div className="policy-precondition">
        <LockSimpleIcon size={18} />
        <div>
          <span>REQUIRED BEFORE A CONTACT CHANGE</span>
          <code>{policy?.precondition ?? "Not captured"}</code>
        </div>
      </div>
      <p className="muted policy-description">
        A backend verification event must precede execution for the same account
        and call.
      </p>
      <dl className="policy-checks">
        {policyChecks(verdict).map(([caption, value]) => (
          <div key={caption}>
            <dt>{caption}</dt>
            <dd className={value === "Not observed" ? "warning-text" : ""}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="inline-help">
        <InfoIcon size={16} />A caller’s assertion never counts as backend
        verification.
      </p>
    </section>
  );
}

function RecordedAudio({ run, onUpdate }: { run: Run; onUpdate: () => void }) {
  const recordings = (run.artifacts ?? []).filter(
    (artifact) =>
      artifact.kind === "recording" &&
      artifact.contentType.startsWith("audio/"),
  );
  if (!recordings.length)
    return (
      <div>
        <p className="empty-evidence">
          {recordingRedacted(run)
            ? "The recording was permanently discarded. Future recording recovery is disabled."
            : "No provider call recording is available yet."}
        </p>
        <RetryRecording run={run} onUpdate={onUpdate} />
      </div>
    );
  return (
    <div>
      {recordings.map((recording) => (
        <RecordingPlayback
          runId={run.id}
          recording={recording}
          key={recording.id}
        />
      ))}
    </div>
  );
}
function RecordingPlayback({
  runId,
  recording,
}: {
  runId: string;
  recording: RecordingArtifact;
}) {
  const [unavailable, setUnavailable] = useState(false);
  return (
    <div className="recording-player">
      <strong>Provider call recording</strong>
      <audio
        controls
        preload="none"
        aria-label="Provider call recording"
        onError={() => setUnavailable(true)}
        src={`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(recording.id)}`}
      />
      {unavailable && (
        <p role="status">
          Recording unavailable or access expired. Refresh your workspace to try
          again.
        </p>
      )}
      <span className="muted small">
        Encrypted at rest · expires{" "}
        {new Date(recording.expiresAt).toLocaleString()}
      </span>
    </div>
  );
}

function recordingRedacted(run: Run) {
  return (
    run.recording?.redacted ||
    (run.events ?? []).some(
      (event) =>
        event.kind === "provider.event" &&
        event.data.operation === "recording_redacted",
    )
  );
}
function recoveredMessage(result: Record<string, unknown>) {
  const updates = [];
  if (result.transcript === "captured") updates.push("Transcript recovered.");
  if (result.recording === "captured") updates.push("Recording recovered.");
  return updates.join(" ");
}
function RetryRecording({ run, onUpdate }: { run: Run; onUpdate: () => void }) {
  const session = useWorkspaceSession();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [discarded, setDiscarded] = useState(false);
  const redacted = recordingRedacted(run) || discarded;
  const transcriptKnown =
    run.recording?.transcriptRedacted ||
    (run.events ?? []).some((event) => event.kind === "transcript");
  if (
    !["completed", "failed", "cancelled"].includes(run.status) ||
    (session?.mode !== "local" && session?.workspace?.role !== "owner")
  )
    return null;
  async function finish() {
    try {
      await onUpdate();
    } catch {
      setMessage(
        (previous) =>
          previous ||
          "Evidence refresh failed. Refresh the workspace before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(`/runs/${run.id}/artifacts/retry`, {});
      setMessage(
        recoveredMessage(result) ||
          "Provider artifacts are available or covered by your privacy settings.",
      );
    } catch (error) {
      const partial =
        error instanceof ApiError && error.details
          ? recoveredMessage(error.details)
          : "";
      setMessage([partial, (error as Error).message].filter(Boolean).join(" "));
    } finally {
      await finish();
    }
  }
  async function discard() {
    if (
      !window.confirm(
        "Permanently discard this recording and disable future recovery? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/runs/${run.id}/artifacts/redact`, {});
      setDiscarded(true);
      setMessage("Recording discarded. Future recording recovery is disabled.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      await finish();
    }
  }
  return (
    <div>
      {(!redacted || !transcriptKnown) && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void retry()}
        >
          {busy
            ? "Retrieving…"
            : redacted
              ? "Retry transcript"
              : "Retry recording"}
        </button>
      )}
      {!redacted && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void discard()}
        >
          Discard recording
        </button>
      )}
      <p className="muted small">
        Recovery reads existing provider artifacts without placing another call.
        Privacy redactions remain permanent.
      </p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
