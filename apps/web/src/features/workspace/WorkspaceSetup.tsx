import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  CopyIcon,
  PlugsIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { SetupStatus } from "../../../../../packages/core/src/setup";
import type { Overview } from "../../shared/types";
import { api, when } from "../../shared/lib";
import "../../styles/onboarding.css";

function CopyCommand({ command, title }: { command: string; title: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="setup-command">
      <code>{command}</code>
      <button
        type="button"
        className="icon-button"
        aria-label={`Copy command for ${title}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setMessage("Copied");
          } catch {
            setMessage("Select and copy the command manually");
          }
        }}
      >
        <CopyIcon size={17} aria-hidden="true" />
      </button>
      <span className="small" role="status">
        {message}
      </span>
    </div>
  );
}

const states = {
  ready: "Ready",
  action_required: "Action needed",
  unavailable: "Unavailable",
  not_checked: "Not checked",
};

export function WorkspaceSetup({
  status,
  error,
  checking,
  onCheck,
  title = "Workspace setup",
}: {
  status: SetupStatus | null;
  error: string;
  checking: boolean;
  onCheck: () => void;
  title?: string;
}) {
  return (
    <section className="workspace-setup" aria-labelledby="setup-heading">
      <div className="setup-heading">
        <div>
          <span className="eyebrow">
            <PlugsIcon size={15} /> GET CONNECTED
          </span>
          <h1 id="setup-heading" tabIndex={-1}>
            {title}
          </h1>
          <p>See what is ready, fix the next prerequisite and check again.</p>
        </div>
        <button
          className="button secondary"
          onClick={onCheck}
          disabled={checking}
        >
          <ArrowClockwiseIcon
            className={checking ? "spin" : ""}
            size={17}
            aria-hidden="true"
          />
          {checking ? "Checking setup…" : "Check setup"}
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          Setup checks could not be updated. {error}
        </p>
      )}
      <p className="setup-check-time" role="status">
        {checking
          ? "Reading the current server configuration and service status."
          : status
            ? `Last checked ${when(status.checkedAt)}`
            : "Check the server connection to continue."}
      </p>
      {status ? (
        <ol className="setup-checks">
          {status.checks.map((check, index) => (
            <li key={check.id}>
              <details open={index === 0 && check.state !== "ready"}>
                <summary>
                  <span
                    className={`setup-state-icon ${check.state}`}
                    aria-hidden="true"
                  >
                    {check.state === "ready" ? (
                      <CheckCircleIcon size={22} />
                    ) : (
                      <WarningCircleIcon size={22} />
                    )}
                  </span>
                  <strong>{check.title}</strong>
                  <span className={`setup-state ${check.state}`}>
                    {states[check.state]}
                  </span>
                </summary>
                <div className="setup-check-body">
                  <p>{check.detail}</p>
                  {check.fields.length > 0 && (
                    <div
                      className="setup-fields"
                      aria-label="Server environment settings"
                    >
                      {check.fields.map((field) => (
                        <code key={field}>{field}</code>
                      ))}
                    </div>
                  )}
                  {check.command && (
                    <CopyCommand command={check.command} title={check.title} />
                  )}
                  <a
                    href={check.docsPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-button"
                  >
                    Open setup guide{" "}
                    <ArrowUpRightIcon size={15} aria-hidden="true" />
                  </a>
                </div>
              </details>
            </li>
          ))}
        </ol>
      ) : !error ? (
        <p role="status">Loading connection checks…</p>
      ) : null}
      <p className="setup-boundary">
        Checks do not place calls. Keep credentials in the server environment
        and restart the affected service after changing them. Provider
        configuration is separate from a verified live call.
      </p>
    </section>
  );
}

export function FirstRunGuide({
  data,
  register,
  setup,
  campaign,
}: {
  data: Overview;
  register: () => void;
  setup: () => void;
  campaign: () => void;
}) {
  const hasTarget = data.targets.length > 0;
  return (
    <section className="first-run-guide" aria-labelledby="first-run-heading">
      <span className="eyebrow">YOUR FIRST REAL RUN</span>
      <h2 id="first-run-heading">
        {hasTarget
          ? data.live.enabled
            ? "Ready to launch your first campaign"
            : "Your target is ready. Connect the caller next."
          : "Start with an approved target"}
      </h2>
      <p>
        Each step builds on your workspace records. Nothing calls a phone until
        you review and authorize a campaign.
      </p>
      <ol className="first-run-steps">
        <li>
          <span className="step-number">01</span>
          <div>
            <h3>Register an approved phone target</h3>
            <p>
              {hasTarget
                ? `${data.targets.length} ${data.targets.length === 1 ? "target is" : "targets are"} registered in this workspace.`
                : "Add a number you own or have explicit permission to test."}
            </p>
          </div>
          <button className="button secondary" onClick={register}>
            {hasTarget
              ? "Register another target"
              : "Register your first target"}
            <ArrowRightIcon size={16} />
          </button>
        </li>
        <li>
          <span className="step-number">02</span>
          <div>
            <h3>Connect the caller and evidence</h3>
            <p>
              {data.live.enabled
                ? "Configuration is present. Launch will verify the provider controls."
                : "Check credentials, authorized numbers, recording storage and resource controls."}
            </p>
          </div>
          <button className="text-button" onClick={setup}>
            {data.live.enabled ? "Review setup" : "Finish caller setup"}
            <ArrowRightIcon size={16} />
          </button>
        </li>
        <li>
          <span className="step-number">03</span>
          <div>
            <h3>Review and launch your baseline</h3>
            <p>
              Choose call limits and budget, then authorize the control and
              adversarial pair.
            </p>
          </div>
          <button className="text-button" onClick={campaign}>
            {hasTarget && data.live.enabled
              ? "Create your first campaign"
              : "Continue setup"}
            <ArrowRightIcon size={16} />
          </button>
        </li>
      </ol>
    </section>
  );
}

export function CallerConnectionCheck({
  configured,
  owner,
}: {
  configured: boolean;
  owner: boolean;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState("");
  async function check() {
    if (pending.current || !configured || !owner) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setChecked("");
    try {
      await api("/integrations/bolna/check", {});
      setChecked(
        `Read-only connection verified ${when(new Date().toISOString())}. No call was placed.`,
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The connection could not be checked. Try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="caller-connection"
      aria-labelledby="caller-check-heading"
    >
      <h2 id="caller-check-heading">Verify the caller connection</h2>
      <p>
        {!owner
          ? "Ask a workspace owner to verify the caller connection."
          : configured
            ? "Send a read-only request to Bolna. This does not launch or authorize a campaign."
            : "Complete the caller configuration above before checking the provider connection."}
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {checked && <p role="status">{checked}</p>}
      <button
        className="button secondary"
        disabled={!configured || !owner || busy}
        onClick={() => void check()}
      >
        <ArrowClockwiseIcon size={16} className={busy ? "spin" : ""} />
        {busy ? "Checking connection…" : "Check connection"}
      </button>
    </section>
  );
}
