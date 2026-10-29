import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  FileCodeIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent } from "react";
import { api, label, titleForRun, when } from "../../shared/lib";
import type { Action, Run } from "../../shared/types";
import {
  BackendSection,
  ConversationSection,
  PolicySection,
} from "./EvidenceViews";
import { FindingReview, Provenance } from "../findings/FindingReview";
import { Badge } from "../../shared/ui/Primitives";
import { useWorkspaceSession } from "../auth/Auth";
const verdicts = {
  violation: {
    style: "violation",
    caption: "Candidate policy violation",
    tone: "red",
    icon: WarningCircleIcon,
  },
  pass: {
    style: "verified",
    caption: "Policy precondition satisfied",
    tone: "violet",
    icon: ShieldCheckIcon,
  },
  unknown: {
    style: "unknown",
    caption: "Evidence is incomplete",
    tone: "neutral",
    icon: ShieldCheckIcon,
  },
};
function VerdictLine({ run }: { run: Run }) {
  const v = run.verdict;
  const view = v
    ? verdicts[v.outcome]
    : {
        style: "unknown",
        caption: label(run.status),
        tone: "neutral",
        icon: ShieldCheckIcon,
      };
  const Icon = view.icon;
  return (
    <div className={`verdict-line ${view.style}`}>
      <span className="verdict-symbol">
        <Icon size={29} weight="light" />
      </span>
      <div>
        <strong>{view.caption}</strong>
        <p>
          {v?.reason ??
            run.error ??
            "Waiting for the worker to collect evidence."}
        </p>
      </div>
      <Badge tone={view.tone}>{v ? label(v.tier) : label(run.status)}</Badge>
    </div>
  );
}
export function rerunAvailability(run: Run, now = Date.now()) {
  const scope = run.scope ?? run.config.scope;
  const providedSlots = run.remainingSlots,
    usedCalls = run.calls_used;
  const remainingSlots =
    typeof providedSlots === "number" && Number.isInteger(providedSlots)
      ? Math.max(0, providedSlots)
      : scope && typeof usedCalls === "number" && Number.isInteger(usedCalls)
        ? Math.max(0, scope.maxCalls - usedCalls)
        : null;
  const blocked = (reason: string) => ({
    enabled: false,
    reason,
    remainingSlots,
  });
  if (run.campaign_status === "stopped")
    return blocked(
      "This campaign is stopped. Start a new authorized campaign.",
    );
  if (!run.campaign_status || remainingSlots === null || !scope)
    return blocked("Refresh the run to load its current campaign scope.");
  if (
    ["mismatch", "unsupported_algorithm"].includes(run.config_integrity ?? "")
  )
    return blocked(
      "The captured configuration cannot be rerun. Create a new campaign.",
    );
  if (remainingSlots === 0)
    return blocked("No call slots remain. Start a new authorized campaign.");
  const startsAt = Date.parse(scope.startsAt),
    endsAt = Date.parse(scope.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt))
    return blocked(
      "The authorized window is unavailable. Create a new campaign.",
    );
  if (now < startsAt)
    return blocked("The authorized window has not started yet.");
  if (now >= endsAt)
    return blocked("The authorized window has ended. Start a new campaign.");
  if (!["completed", "failed", "cancelled"].includes(run.status))
    return blocked("Wait for this run and its evidence collection to finish.");
  return { enabled: true, reason: "", remainingSlots };
}
function RunHeading({
  run,
  rerun,
  busy,
  availability,
}: {
  run: Run;
  rerun: () => void;
  busy: boolean;
  availability: ReturnType<typeof rerunAvailability>;
}) {
  return (
    <div className="page-heading detail-heading">
      <div>
        <span className="eyebrow">EVIDENCE / {run.id.slice(0, 8)}</span>
        <h1 tabIndex={-1}>{titleForRun(run)}</h1>
        <p>
          {run.target_name} <span className="separator">/</span>{" "}
          {when(run.created_at)} <span className="separator">/</span> Provider
          evidence
        </p>
        <p id="rerun-availability" className="run-scope-status">
          {availability.remainingSlots === null
            ? "Call slots unavailable"
            : `${availability.remainingSlots} call ${availability.remainingSlots === 1 ? "slot" : "slots"} remaining`}
          {availability.reason && ` · ${availability.reason}`}
        </p>
      </div>
      <div className="heading-actions">
        <button
          className="button secondary"
          onClick={rerun}
          disabled={busy || !availability.enabled}
          aria-describedby="rerun-availability"
        >
          <ArrowCounterClockwiseIcon size={17} />
          Rerun case
        </button>
        {run.exportReady === true && (run.events?.length ?? 0) > 0 ? (
          <a
            className="button primary"
            href={`/api/runs/${run.id}/export`}
            download
          >
            <FileCodeIcon size={17} />
            Export regression
          </a>
        ) : (
          <button
            className="button primary"
            disabled
            title="Recorded evidence must be available before exporting a regression."
          >
            <FileCodeIcon size={17} />
            Export not ready
          </button>
        )}
      </div>
    </div>
  );
}
export function RunDetail({
  run,
  back,
  onUpdate,
  action,
}: {
  run: Run;
  back: () => void;
  onUpdate: () => void;
  action: Action;
}) {
  const [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now);
  const scope = run.scope ?? run.config.scope;
  useEffect(() => {
    const boundaries = [
      Date.parse(scope?.startsAt ?? ""),
      Date.parse(scope?.endsAt ?? ""),
    ].filter((boundary) => Number.isFinite(boundary) && boundary > now);
    if (!boundaries.length) return;
    const delay = Math.min(
      2147483647,
      Math.max(0, Math.min(...boundaries) - Date.now() + 1),
    );
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [scope?.startsAt, scope?.endsAt, now]);
  const availability = rerunAvailability(run, now);
  async function rerun() {
    if (busy || !rerunAvailability(run).enabled) {
      setNow(Date.now());
      return;
    }
    setBusy(true);
    try {
      const result = await action(
        `/runs/${run.id}/rerun`,
        {},
        "Same configuration queued. A call slot was reserved from the original scope.",
      );
      if (result) await onUpdate();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="run-detail page-enter">
      <button className="back-button" onClick={back}>
        <ArrowLeftIcon size={17} />
        Back to workspace
      </button>
      <RunHeading
        run={run}
        rerun={rerun}
        busy={busy}
        availability={availability}
      />
      <VerdictLine run={run} />
      <LiveExecutionPanel run={run} action={action} onUpdate={onUpdate} />
      <div className="detail-grid">
        <div className="evidence-main">
          <ConversationSection run={run} onUpdate={onUpdate} />
          <BackendSection events={run.events ?? []} />
          <ConnectorSetup run={run} />
          <EvidencePrivacy run={run} onUpdate={onUpdate} />
        </div>
        <aside className="evidence-aside">
          <PolicySection verdict={run.verdict} policy={run.config.policy} />
          <FindingReview run={run} action={action} onUpdate={onUpdate} />
          <Provenance run={run} />
        </aside>
      </div>
    </div>
  );
}

function cents(value: number | null | undefined) {
  return value === null || value === undefined
    ? "Not finalized"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
      }).format(value / 100);
}
function LiveExecutionPanel({
  run,
  action,
  onUpdate,
}: {
  run: Run;
  action: Action;
  onUpdate: () => void;
}) {
  const execution = run.liveExecution;
  return (
    <section className="live-execution" aria-label="Live execution status">
      <div className="section-heading">
        <h2>Live execution</h2>
        <Badge>{label(execution?.state ?? run.status)}</Badge>
      </div>
      <dl>
        <div>
          <dt>Provider execution</dt>
          <dd>{execution?.provider_execution_id ?? "Not assigned"}</dd>
        </div>
        <div>
          <dt>Budget reserved</dt>
          <dd>{cents(execution?.reserved_cents)}</dd>
        </div>
        <div>
          <dt>Finalized cost</dt>
          <dd>{cents(execution?.settled_cents)}</dd>
        </div>
        <div>
          <dt>Stop request</dt>
          <dd>{execution?.cancel_requested ? "Requested" : "None"}</dd>
        </div>
      </dl>
      {execution?.last_error && <p role="status">{execution.last_error}</p>}
      {["dispatch_unknown", "manual_reconciliation"].includes(
        execution?.state ?? "",
      ) && (
        <p className="inline-error" role="status">
          The provider outcome needs reconciliation. No replacement call will be
          submitted automatically.
        </p>
      )}
      {["dispatch_unknown", "submitting", "manual_reconciliation"].includes(
        execution?.state ?? "",
      ) && (
        <ExecutionReconciliation
          run={run}
          action={action}
          onUpdate={onUpdate}
        />
      )}
      {execution?.provider_execution_id && (
        <CopyExecutionId value={execution.provider_execution_id} />
      )}
    </section>
  );
}
function CopyExecutionId({ value }: { value: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Execution ID copied.");
    } catch {
      setMessage(
        "Copy is unavailable. Select the execution ID above and copy it manually.",
      );
    }
  }
  return (
    <div>
      <button className="text-button" onClick={() => void copy()}>
        Copy execution ID
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
function ExecutionReconciliation({
  run,
  action,
  onUpdate,
}: {
  run: Run;
  action: Action;
  onUpdate: () => void;
}) {
  const session = useWorkspaceSession();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (session?.mode !== "local" && session?.workspace?.role !== "owner")
    return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const result = await action(
        `/runs/${run.id}/reconcile`,
        { providerExecutionId: String(form.get("providerExecutionId")).trim() },
        "Execution linked for reconciliation. The worker will verify its run, target and caller before accepting evidence.",
      );
      if (result) onUpdate();
      else
        setMessage(
          "The execution could not be linked. Check the workspace error before trying again.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="execution-reconciliation">
      <summary>Link an existing provider execution</summary>
      <p>
        Use the execution ID from the provider when a submission outcome is
        uncertain. The worker verifies correlation before accepting it. This
        does not place another call.
      </p>
      <form className="setup-form" onSubmit={submit}>
        <label>
          Provider execution ID
          <input
            name="providerExecutionId"
            required
            minLength={3}
            maxLength={200}
            autoComplete="off"
          />
        </label>
        <button className="button secondary" disabled={busy}>
          {busy ? "Linking…" : "Link execution for reconciliation"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
function ConnectorSetup({ run }: { run: Run }) {
  const session = useWorkspaceSession();
  const [settings, setSettings] = useState<Record<string, unknown> | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (session?.mode !== "local" && session?.workspace?.role !== "owner")
    return null;
  async function reveal() {
    setBusy(true);
    setMessage("");
    try {
      setSettings(await api(`/runs/${run.id}/connector-credentials`));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
      setMessage(
        "Connector settings copied. Keep signing keys on your backend.",
      );
    } catch {
      setMessage(
        "Copy is unavailable. Select the settings and copy them manually.",
      );
    }
  }
  return (
    <section className="connector-setup">
      <h2>Connect backend evidence</h2>
      <p>
        Use this run’s signed connector settings on your test backend. Never put
        signing keys in your voice agent prompt or browser application.
      </p>
      {settings ? (
        <>
          <pre tabIndex={0}>{JSON.stringify(settings, null, 2)}</pre>
          <button className="button secondary" onClick={() => void copy()}>
            Copy connector settings
          </button>
          <button
            className="text-button"
            onClick={() => {
              setSettings(null);
              setMessage("");
            }}
          >
            Hide settings
          </button>
        </>
      ) : (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void reveal()}
        >
          {busy ? "Loading…" : "Reveal run connector settings"}
        </button>
      )}
      {message && <p role="status">{message}</p>}
      <a href="/docs/evidence" target="_blank" rel="noopener noreferrer">
        Read the evidence integration guide
      </a>
    </section>
  );
}

function EvidencePrivacy({
  run,
  onUpdate,
}: {
  run: Run;
  onUpdate: () => void;
}) {
  const session = useWorkspaceSession();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const terminal = ["completed", "failed", "cancelled"].includes(run.status);
  if (
    !terminal ||
    (session?.mode !== "local" && session?.workspace?.role !== "owner")
  )
    return null;
  async function redact() {
    if (
      !window.confirm(
        "Permanently redact this transcript? Backend facts and the verdict will remain.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api(`/runs/${run.id}/redact-transcript`, {});
      await onUpdate();
      setMessage(`${result.redacted} transcript events redacted.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeRecording(id: string) {
    if (
      !window.confirm(
        "Permanently delete this recording? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/runs/${run.id}/artifacts/${id}`, {}, undefined, "DELETE");
      await onUpdate();
      setMessage("Recording deleted.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const redactable =
    run.events?.some(
      (event) => event.kind === "transcript" && event.data.redacted !== true,
    ) ?? false;
  return (
    <details className="evidence-privacy">
      <summary>Evidence retention and privacy</summary>
      <p>
        Owner actions apply permanently. Redaction replaces transcript text with
        a marker while preserving backend facts, the verdict and an audit
        record.
      </p>
      <button
        className="button secondary"
        disabled={busy || !redactable}
        onClick={() => void redact()}
      >
        Redact transcript
      </button>
      {(run.artifacts ?? []).map((artifact, index) => (
        <button
          className="text-button"
          key={artifact.id}
          disabled={busy}
          onClick={() => void removeRecording(artifact.id)}
        >
          Delete recording {index + 1}
        </button>
      ))}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
