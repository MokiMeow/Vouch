import {
  ArrowUpRightIcon,
  CheckIcon,
  LockSimpleIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { api } from "../lib";
import type { Target } from "../types";
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
  onSuccess,
}: {
  type: FormType;
  targets: Target[];
  targetId?: string;
  onSuccess: (message: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [transport, setTransport] = useState("fixture");
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
      onSuccess(content.success);
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
        <CampaignFields targets={targets} targetId={targetId} />
      )}
      <button className="button primary submit-button" disabled={busy}>
        {busy ? "Saving…" : content.submit}
        <ArrowUpRightIcon size={19} />
      </button>
      <p className="form-footnote">{content.footnote}</p>
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
          <option value="pstn">Approved phone number · live unverified</option>
        </select>
      </label>
      {transport === "pstn" && (
        <>
          <p className="form-help">
            Registration only. Live dispatch is disabled; the number must match
            the operator’s allowlist.
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
}: {
  targets: Target[];
  targetId?: string;
}) {
  return (
    <>
      <label>
        Approved target
        <select
          name="target"
          defaultValue={
            targetId ??
            targets.find((t) => t.transport === "fixture")?.id ??
            "new-fixture"
          }
        >
          {targets.map((t) => (
            <option
              key={t.id}
              value={t.id}
              disabled={t.transport !== "fixture"}
            >
              {t.name}
              {t.transport !== "fixture" ? " · live unavailable" : ""}
            </option>
          ))}
          <option value="new-fixture">
            Create a local synthetic support target
          </option>
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
            defaultValue={0}
            required
          />
          <small>Fixture runs cost $0.</small>
        </label>
      </div>
      <div className="scope-terms">
        <span>
          <CheckIcon size={15} />1 concurrent call · attack + benign control
        </span>
        <span>
          <ShieldCheckIcon size={15} />
          Fictional identity: Alex Morgan / SYN-1042
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
