import {
  ArrowDownIcon,
  CodeIcon,
  HeadphonesIcon,
  InfoIcon,
  LockSimpleIcon,
  PauseIcon,
  PlayIcon,
  ShieldCheckIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CapturedPolicy } from "../../../../packages/core/src/schemas";
import { label } from "../lib";
import type { EvidenceEvent, Run, Verdict } from "../types";
import { Badge } from "./Primitives";
function useSpeech(transcript: EvidenceEvent[]) {
  const [playing, setPlaying] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  function speak() {
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    if (!window.speechSynthesis) {
      setMessage(
        "Speech synthesis is unavailable. The complete transcript is below.",
      );
      return;
    }
    if (!window.speechSynthesis.getVoices().length) {
      setMessage(
        "No local speech voices are installed. The complete synthetic transcript is below.",
      );
      return;
    }
    setPlaying(true);
    transcript.forEach((event, i) => {
      const utterance = new SpeechSynthesisUtterance(
        String(event.data.text ?? ""),
      );
      utterance.rate = 1.05;
      utterance.onerror = () => {
        setPlaying(false);
        setMessage("Speech replay is unavailable in this browser.");
      };
      if (i === transcript.length - 1)
        utterance.onend = () => setPlaying(false);
      window.speechSynthesis.speak(utterance);
    });
  }
  return { playing, message, speak };
}
function AudioPlayer({ transcript }: { transcript: EvidenceEvent[] }) {
  const { playing, message, speak } = useSpeech(transcript);
  return (
    <>
      <div className="audio-player">
        <button
          className="audio-play"
          onClick={speak}
          disabled={!transcript.length}
          aria-label={
            playing
              ? "Stop synthetic speech replay"
              : "Replay transcript with synthetic speech"
          }
        >
          {playing ? (
            <PauseIcon size={21} weight="fill" />
          ) : (
            <PlayIcon size={21} weight="fill" />
          )}
        </button>
        <div>
          <strong>Synthetic transcript replay</strong>
          <span>Browser speech · not a call recording</span>
        </div>
        <div className={`wave ${playing ? "playing" : ""}`} aria-hidden="true">
          {Array.from({ length: 35 }, (_, i) => (
            <i
              key={i}
              style={{
                height: `${8 + ((i * 17 + 7) % 24)}px`,
                animationDelay: `${i * 0.03}s`,
              }}
            />
          ))}
        </div>
      </div>
      {message && (
        <p role="status" className="speech-note">
          {message}
        </p>
      )}
    </>
  );
}
function Utterance({
  event,
  callerLabel,
}: {
  event: EvidenceEvent;
  callerLabel: string;
}) {
  const caller = event.source === "caller";
  return (
    <article className={`utterance ${caller ? "caller" : ""}`}>
      <span className="speaker-avatar">
        {caller ? <HeadphonesIcon size={18} /> : <WaveformIcon size={18} />}
      </span>
      <div>
        <div className="speaker">
          <strong>{caller ? callerLabel : "Support agent"}</strong>
          <time>{String(Math.floor(event.at / 1000)).padStart(2, "0")}s</time>
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
          <time>{Math.floor(e.at / 1000)}s</time>
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
export function ConversationSection({ run }: { run: Run }) {
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
        <Badge>Synthetic</Badge>
      </div>
      <AudioPlayer transcript={transcript} />
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
        Independently read from PostgreSQL · fictional account
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
