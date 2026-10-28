import {
  CheckIcon,
  LockSimpleIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { label, when } from "../lib";
import type { Action, Run, Scope } from "../types";
import { Badge } from "./Primitives";
function ReviewHistory({ reviews }: { reviews: NonNullable<Run["reviews"]> }) {
  if (!reviews.length) return null;
  return (
    <details className="review-history">
      <summary>
        Review history <span>{reviews.length}</span>
      </summary>
      {reviews.map((r) => (
        <article key={r.id}>
          <strong>
            {label(r.decision)}
            <time>{when(r.created_at)}</time>
          </strong>
          <p>{r.note}</p>
        </article>
      ))}
    </details>
  );
}
export function FindingReview({
  run,
  action,
  onUpdate,
}: {
  run: Run;
  action: Action;
  onUpdate: () => void;
}) {
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  async function review(decision: "confirmed" | "dismissed") {
    if (busy) return;
    setBusy(true);
    try {
      const result = await action(
        `/runs/${run.id}/review`,
        { decision, note },
        "Reviewer decision saved to the audit history.",
      );
      if (result) {
        setNote("");
        onUpdate();
      }
    } finally {
      setBusy(false);
    }
  }
  const invalid = busy || note.trim().length < 3;
  return (
    <section className="review-section">
      <div className="section-heading">
        <h2>Make the call.</h2>
        <Badge tone={run.review === "pending" ? "amber" : "violet"}>
          {label(run.review)}
        </Badge>
      </div>
      {run.verdict?.outcome === "violation" ? (
        <>
          <p>Review the evidence, then leave a decision and a rationale.</p>
          <label htmlFor="review-note" className="field-label">
            Review rationale
          </label>
          <textarea
            id="review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What supports your decision?"
            maxLength={2000}
            aria-describedby="review-help"
          />
          <small id="review-help">
            At least 3 characters. Decisions are retained in the audit trail.
          </small>
          <div className="review-actions">
            <button
              className="button primary"
              disabled={invalid}
              onClick={() => review("confirmed")}
            >
              <CheckIcon size={16} />
              Confirm
            </button>
            <button
              className="button secondary"
              disabled={invalid}
              onClick={() => review("dismissed")}
            >
              Dismiss
            </button>
          </div>
          <ReviewHistory reviews={run.reviews ?? []} />
        </>
      ) : (
        <p className="inline-help">
          <ShieldCheckIcon size={20} />
          Only candidate violations need a finding decision.
        </p>
      )}
    </section>
  );
}
function ScopeDetails({ scope }: { scope: Scope | undefined }) {
  if (!scope) return null;
  const fields = [
    ["Maximum calls", scope.maxCalls],
    ["Max duration / call", `${scope.maxDurationSeconds}s`],
    ["Budget", `$${(scope.budgetCents / 100).toFixed(2)}`],
    ["Window ends", when(scope.endsAt)],
  ];
  return (
    <details>
      <summary>View captured scope</summary>
      <dl>
        {fields.map(([caption, value]) => (
          <div className="scope-field" key={caption}>
            <dt>{caption}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
export function Provenance({ run }: { run: Run }) {
  return (
    <section className="provenance">
      <div>
        <LockSimpleIcon size={16} />
        <h3>Same configuration. Full context.</h3>
      </div>
      <p>Policy, scope, persona and runtime were captured for this run.</p>
      <code className="config-hash" title={run.config_hash}>
        {run.config_hash ?? "Hash unavailable"}
      </code>
      <span>Model: {run.config.runtime?.model ?? "Unknown"}</span>
      <span>API: {run.config.runtime?.apiFlavor ?? "Unknown"}</span>
      <ScopeDetails scope={run.config.scope} />
    </section>
  );
}
