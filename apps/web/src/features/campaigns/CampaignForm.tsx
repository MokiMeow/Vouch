import {
  ArrowUpRightIcon,
  CheckIcon,
  LockSimpleIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { api } from "../../shared/lib";
import type { Overview, Target } from "../../shared/types";
type FormType = "campaign" | "target";
const copy = {
  campaign: {
    intro:
      "Two conversations. One policy. A complete evidence trail. Set the limits before the first test.",
    label: "Campaign name",
    name: "Contact verification · baseline",
    submit: "Launch fixture campaign",
    footnote: "Synthetic data only. No real phone call will be placed.",
    success:
      "Campaign queued. The worker will run the benign control and adversarial case.",
  },
  target: {
    intro: "Register a target you own or have explicit permission to test.",
    label: "Target name",
    name: "",
    submit: "Register target",
    footnote: "Authorization and scope are enforced by the server.",
    success: "Approved target registered.",
  },
};
async function saveTarget(form: FormData, transport: string) {
  return api("/targets", {
    name: form.get("name"),
    transport,
    authorized: form.get("authorized") === "on",
    authorizationReference: form.get("reference"),
    ...(transport === "pstn" ? { phone: form.get("phone") } : {}),
  });
}
async function saveCampaign(form: FormData) {
  let targetId = String(form.get("target"));
  if (targetId === "new-fixture")
    targetId = (
      await api("/targets", {
        name: "Northstar Support · Sandbox",
        transport: "fixture",
        authorized: true,
        authorizationReference:
          "Local synthetic target owned by this workspace; fictional accounts only.",
      })
    ).id;
  return api("/campaigns", {
    name: form.get("name"),
    targetId,
    mode: form.get("mode") ?? "fixture",
    scope: {
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(
        Date.now() + Number(form.get("window")) * 60000,
      ).toISOString(),
      concurrency: 1,
      maxCalls: Number(form.get("maxCalls")),
      maxDurationSeconds: Number(form.get("duration")),
      budgetCents: Math.round(Number(form.get("budget")) * 100),
      syntheticIdentity: "Alex Morgan / SYN-1042",
      categories: ["false_authority", "benign_control"],
      prohibitedActions: [
        "real_personal_data",
        "real_payments",
        "external_targets",
      ],
      stopOnFinding: form.get("stop") === "on",
    },
  });
}
export function SetupForm({
  type,
  targets,
  targetId,
  live,
  onSuccess,
}: {
  type: FormType;
  targets: Target[];
  targetId?: string;
  live?: Overview["live"];
  onSuccess: (message: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [transport, setTransport] = useState("fixture");
  const [mode, setMode] = useState<"fixture" | "live">(
    targets.find((target) => target.id === targetId)?.transport === "pstn"
      ? "live"
      : "fixture",
  );
  const liveCampaign = type === "campaign" && mode === "live";
  const content = copy[type];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const save = {
      campaign: saveCampaign,
      target: (data: FormData) => saveTarget(data, transport),
    };
    try {
      await save[type](form);
      onSuccess(
        liveCampaign
          ? "Live campaign queued. The worker will recheck authorization and provider controls before dispatch."
          : content.success,
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="setup-form" onSubmit={submit}>
      {error && (
        <div className="inline-error" role="alert">
          <WarningCircleIcon size={19} />
          {error}
        </div>
      )}
      <p className="form-intro">{content.intro}</p>
      {type === "campaign" && (
        <label>
          Test mode
          <select
            value={mode}
            name="mode"
            onChange={(event) =>
              setMode(event.target.value as "fixture" | "live")
            }
          >
            <option value="fixture">
              Synthetic fixture · no provider cost
            </option>
            <option value="live">
              Live Bolna call · approved targets only
            </option>
          </select>
        </label>
      )}
      {liveCampaign && !live?.enabled && (
        <p className="inline-error" role="status">
          <WarningCircleIcon size={18} />
          {live?.reason ??
            "Live prerequisites must be configured before dispatch."}
        </p>
      )}
      <label>
        {content.label}
        <input
          autoFocus
          name="name"
          required
          minLength={3}
          maxLength={80}
          defaultValue={content.name}
          placeholder="e.g. Northstar Support"
        />
      </label>
      {type === "target" ? (
        <TargetFields transport={transport} setTransport={setTransport} />
      ) : (
        <CampaignFields
          key={mode}
          targets={targets}
          targetId={targetId}
          mode={mode}
        />
      )}
      <button
        className="button primary submit-button"
        disabled={
          busy ||
          (liveCampaign &&
            (!live?.enabled ||
              !targets.some((target) => target.transport === "pstn")))
        }
      >
        {busy
          ? "Saving…"
          : liveCampaign
            ? "Authorize and launch live campaign"
            : content.submit}
        <ArrowUpRightIcon size={19} />
      </button>
      <p className="form-footnote">
        {liveCampaign
          ? "This may place real calls to your approved test number and consume the authorized budget."
          : content.footnote}
      </p>
    </form>
  );
}

function TargetFields({
  transport,
  setTransport,
}: {
  transport: string;
  setTransport: (value: string) => void;
}) {
  return (
    <>
      <label>
        Target transport
        <select
          value={transport}
          onChange={(e) => setTransport(e.target.value)}
        >
          <option value="fixture">Synthetic support agent</option>
          <option value="pstn">Approved phone number</option>
        </select>
      </label>
      {transport === "pstn" && (
        <>
          <p className="form-help">
            The number must match the operator’s allowlist. Registration does
            not launch a call.
          </p>
          <label>
            Approved E.164 phone number
            <input
              name="phone"
              required
              placeholder="+12025550199"
              pattern="\+[1-9][0-9]{7,14}"
            />
          </label>
        </>
      )}
      <label>
        Authorization reference
        <textarea
          name="reference"
          required
          minLength={5}
          maxLength={300}
          placeholder="Owner approval, test agreement, or synthetic sandbox scope"
        />
      </label>
      <label className="check-label">
        <input type="checkbox" name="authorized" required />
        <span>
          I own this target or have explicit authorization to test it.
        </span>
      </label>
    </>
  );
}
function CampaignFields({
  targets,
  targetId,
  mode,
}: {
  targets: Target[];
  targetId?: string;
  mode: "fixture" | "live";
}) {
  const eligible = targets.filter(
    (target) => target.transport === (mode === "live" ? "pstn" : "fixture"),
  );
  const selected =
    eligible.find((target) => target.id === targetId)?.id ??
    eligible[0]?.id ??
    (mode === "fixture" ? "new-fixture" : "");
  return (
    <>
      <label>
        Approved target
        <select name="target" defaultValue={selected} required>
          {mode === "live" && eligible.length === 0 && (
            <option value="">Register an approved phone target first</option>
          )}
          {eligible.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name}
            </option>
          ))}
          {mode === "fixture" && (
            <option value="new-fixture">
              Create a local synthetic support target
            </option>
          )}
        </select>
      </label>
      <div className="form-grid">
        <label>
          Maximum calls
          <input
            name="maxCalls"
            type="number"
            min={2}
            max={20}
            defaultValue={4}
            required
          />
          <small>The first pair reserves 2 slots.</small>
        </label>
        <label>
          Max duration / call (seconds)
          <input
            name="duration"
            type="number"
            min={40}
            max={300}
            defaultValue={60}
            required
          />
        </label>
        <label>
          Authorized window (minutes)
          <input
            name="window"
            type="number"
            min={1}
            max={1440}
            defaultValue={60}
            required
          />
        </label>
        <label>
          Budget limit (USD)
          <input
            name="budget"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={mode === "fixture" ? 0 : 10}
            required
          />
          <small>
            {mode === "fixture"
              ? "Fixture runs cost $0."
              : "The worker reserves worst-case cost before each call."}
          </small>
        </label>
      </div>
      <div className="scope-terms">
        <span>
          <CheckIcon size={15} />1 concurrent call · attack + benign control
        </span>
        <span>
          <ShieldCheckIcon size={15} />
          Fictional identity · Alex Morgan / SYN-1042
        </span>
        <span>
          <LockSimpleIcon size={15} />
          No real personal data, payments, or external targets
        </span>
      </div>
      <label className="check-label">
        <input name="stop" type="checkbox" />
        <span>Stop remaining calls after the first policy violation</span>
      </label>
      <label className="check-label">
        <input type="checkbox" required />
        <span>I authorize this campaign within the scope above.</span>
      </label>
    </>
  );
}
