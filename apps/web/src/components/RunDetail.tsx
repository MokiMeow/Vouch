import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  FileCodeIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { label, titleForRun, when } from "../lib";
import type { Action, Run } from "../types";
import {
  BackendSection,
  ConversationSection,
  PolicySection,
} from "./EvidenceViews";
import { FindingReview, Provenance } from "./FindingReview";
import { Badge } from "./Primitives";
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
function RunHeading({
  run,
  rerun,
  busy,
}: {
  run: Run;
  rerun: () => void;
  busy: boolean;
}) {
  return (
    <div className="page-heading detail-heading">
      <div>
        <span className="eyebrow">EVIDENCE / {run.id.slice(0, 8)}</span>
        <h1 tabIndex={-1}>{titleForRun(run)}</h1>
        <p>
          {run.target_name} <span className="separator">/</span>{" "}
          {when(run.created_at)} <span className="separator">/</span> Synthetic
          fixture
        </p>
      </div>
      <div className="heading-actions">
        <button
          className="button secondary"
          onClick={rerun}
          disabled={busy || ["queued", "running"].includes(run.status)}
        >
          <ArrowCounterClockwiseIcon size={17} />
          Rerun case
        </button>
        <a
          className="button primary"
          href={`/api/runs/${run.id}/export`}
          download
        >
          <FileCodeIcon size={17} />
          Export regression
        </a>
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
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!["queued", "running"].includes(run.status)) return;
    const timer = setInterval(onUpdate, 1500);
    return () => clearInterval(timer);
  }, [run.status, run.id, onUpdate]);
  async function rerun() {
    if (busy) return;
    setBusy(true);
    try {
      await action(
        `/runs/${run.id}/rerun`,
        {},
        "Same configuration queued. A call slot was reserved from the original scope.",
      );
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
      <RunHeading run={run} rerun={rerun} busy={busy} />
      <VerdictLine run={run} />
      <div className="detail-grid">
        <div className="evidence-main">
          <ConversationSection run={run} />
          <BackendSection events={run.events ?? []} />
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
