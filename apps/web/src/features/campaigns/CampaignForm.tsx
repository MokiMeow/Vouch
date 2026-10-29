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
type Errors = Record<string, string>;
const copy = {
  campaign: {
    intro: "Set the approved target and limits before placing a call.",
    label: "Campaign name",
    submit: "Authorize and launch campaign",
    success:
      "Campaign queued. The worker will recheck authorization and provider controls before dispatch.",
  },
  target: {
    intro:
      "Register a phone target you own or have explicit permission to test.",
    label: "Target name",
    submit: "Register target",
    success: "Approved target registered.",
  },
};
const value = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
function validate(form: FormData, type: FormType, targets: Target[]): Errors {
  const errors: Errors = {};
  const name = value(form, "name");
  const minimumName = type === "target" ? 2 : 3;
  if (name.length < minimumName || name.length > 80)
    errors.name = `Enter a name between ${minimumName} and 80 characters. Spaces alone do not count.`;
  if (type === "target") {
    if (!/^\+[1-9]\d{7,14}$/.test(value(form, "phone")))
      errors.phone =
        "Enter an international phone number starting with + and its country code.";
    const reference = value(form, "reference");
    if (reference.length < 5 || reference.length > 300)
      errors.reference = "Describe your authorization in 5 to 300 characters.";
    if (form.get("authorized") !== "on")
      errors.authorized =
        "Confirm that you are authorized to test this target.";
    return errors;
  }
  if (
    !targets.some(
      (target) =>
        target.id === value(form, "target") && target.transport === "pstn",
    )
  )
    errors.target =
      "Select an approved phone target. Register one before launching a campaign.";
  for (const [field, minimum, maximum, caption] of [
    ["maxCalls", 2, 20, "Maximum calls"],
    ["duration", 40, 300, "Call duration"],
    ["window", 1, 1440, "Authorized window"],
  ] as const) {
    const number = Number(value(form, field));
    if (
      !value(form, field) ||
      !Number.isInteger(number) ||
      number < minimum ||
      number > maximum
    )
      errors[field] =
        `${caption} must be a whole number between ${minimum} and ${maximum}.`;
  }
  const budget = Number(value(form, "budget"));
  if (
    !value(form, "budget") ||
    !Number.isFinite(budget) ||
    budget < 0 ||
    budget > 100 ||
    Math.abs(budget * 100 - Math.round(budget * 100)) > 0.000001
  )
    errors.budget =
      "Enter a budget from 0 to 100 USD with no more than two decimal places.";
  if (form.get("campaignAuthorized") !== "on")
    errors.campaignAuthorized =
      "Authorize this campaign within the displayed scope before launching.";
  return errors;
}
function saveTarget(form: FormData) {
  return api("/targets", {
    name: value(form, "name"),
    transport: "pstn",
    phone: value(form, "phone"),
    authorized: form.get("authorized") === "on",
    authorizationReference: value(form, "reference"),
  });
}
function saveCampaign(form: FormData) {
  const startsAt = Date.now() - 1000;
  return api("/campaigns", {
    name: value(form, "name"),
    targetId: value(form, "target"),
    mode: "live",
    scope: {
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(
        startsAt + Number(form.get("window")) * 60000,
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
function FieldError({ name, errors }: { name: string; errors: Errors }) {
  return errors[name] ? (
    <small id={`form-error-${name}`} className="field-error" role="alert">
      {errors[name]}
    </small>
  ) : null;
}
function invalid(name: string, errors: Errors) {
  return {
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `form-error-${name}` : undefined,
  };
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
    [errors, setErrors] = useState<Errors>({}),
    [busy, setBusy] = useState(false);
  const content = copy[type];
  const eligible = targets.filter((target) => target.transport === "pstn");
  const blocked =
    type === "campaign" && (!live?.enabled || eligible.length === 0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || blocked) return;
    const element = event.currentTarget,
      form = new FormData(element);
    const problems = validate(form, type, targets);
    setError("");
    setErrors(problems);
    if (Object.keys(problems).length) {
      const field = element.elements.namedItem(Object.keys(problems)[0]);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    setBusy(true);
    try {
      await (type === "target" ? saveTarget(form) : saveCampaign(form));
      onSuccess(content.success);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The request could not be completed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="setup-form"
      onSubmit={submit}
      noValidate
      aria-busy={busy}
      onInput={(event) => {
        const name = (event.target as HTMLInputElement).name;
        if (name) setErrors((previous) => ({ ...previous, [name]: "" }));
        setError("");
      }}
    >
      {error && (
        <div className="inline-error" role="alert">
          <WarningCircleIcon size={19} />
          {error}
        </div>
      )}
      <p className="form-intro">{content.intro}</p>
      {type === "campaign" && !live?.enabled && (
        <p className="inline-error" role="status">
          <WarningCircleIcon size={18} />
          {live?.reason ??
            "Configure the caller and resource controls before launching a campaign."}
        </p>
      )}
      <label>
        {content.label}
        <input
          autoFocus
          name="name"
          required
          minLength={type === "target" ? 2 : 3}
          maxLength={80}
          placeholder={
            type === "target"
              ? "Your approved support agent"
              : "Name this authorized campaign"
          }
          {...invalid("name", errors)}
        />
        <FieldError name="name" errors={errors} />
      </label>
      {type === "target" ? (
        <TargetFields errors={errors} />
      ) : (
        <CampaignFields
          targets={eligible}
          targetId={targetId}
          errors={errors}
        />
      )}
      <button
        className="button primary submit-button"
        disabled={busy || blocked}
      >
        {busy ? "Saving…" : content.submit}
        <ArrowUpRightIcon size={19} />
      </button>
      <p className="form-footnote">
        {type === "campaign"
          ? "Launching places real calls to the approved number and can consume the authorized budget."
          : "Registration checks authorization and the operator allowlist without placing a call."}
      </p>
    </form>
  );
}
function TargetFields({ errors }: { errors: Errors }) {
  return (
    <>
      <label>
        Approved international phone number
        <input
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          maxLength={16}
          placeholder="Start with + and the country code"
          {...invalid("phone", errors)}
        />
        <FieldError name="phone" errors={errors} />
      </label>
      <p className="form-help">
        Use the exact phone number approved in the operator allowlist.
      </p>
      <label>
        Authorization reference
        <textarea
          name="reference"
          required
          minLength={5}
          maxLength={300}
          placeholder="Owner approval or signed test agreement"
          {...invalid("reference", errors)}
        />
        <FieldError name="reference" errors={errors} />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          name="authorized"
          required
          {...invalid("authorized", errors)}
        />
        <span>
          I own this target or have explicit authorization to test it.
        </span>
      </label>
      <FieldError name="authorized" errors={errors} />
    </>
  );
}
function CampaignFields({
  targets,
  targetId,
  errors,
}: {
  targets: Target[];
  targetId?: string;
  errors: Errors;
}) {
  const selected =
    targets.find((target) => target.id === targetId)?.id ??
    targets[0]?.id ??
    "";
  return (
    <>
      <label>
        Approved target
        <select
          name="target"
          defaultValue={selected}
          required
          {...invalid("target", errors)}
        >
          {!targets.length && (
            <option value="">Register an approved phone target first</option>
          )}
          {targets.map((target) => (
            <option value={target.id} key={target.id}>
              {target.name}
            </option>
          ))}
        </select>
        <FieldError name="target" errors={errors} />
      </label>
      <div className="form-grid">
        <label>
          Maximum calls
          <input
            name="maxCalls"
            type="number"
            min={2}
            max={20}
            step={1}
            defaultValue={4}
            required
            {...invalid("maxCalls", errors)}
          />
          <small>The first pair reserves 2 slots.</small>
          <FieldError name="maxCalls" errors={errors} />
        </label>
        <label>
          Maximum duration per call in seconds
          <input
            name="duration"
            type="number"
            min={40}
            max={300}
            step={1}
            defaultValue={60}
            required
            {...invalid("duration", errors)}
          />
          <FieldError name="duration" errors={errors} />
        </label>
        <label>
          Authorized window in minutes
          <input
            name="window"
            type="number"
            min={1}
            max={1440}
            step={1}
            defaultValue={60}
            required
            {...invalid("window", errors)}
          />
          <FieldError name="window" errors={errors} />
        </label>
        <label>
          Budget limit in USD
          <input
            name="budget"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={10}
            required
            {...invalid("budget", errors)}
          />
          <small>The worker reserves worst-case cost before each call.</small>
          <FieldError name="budget" errors={errors} />
        </label>
      </div>
      <div className="scope-terms">
        <span>
          <CheckIcon size={15} />1 concurrent call · attack and benign control
        </span>
        <span>
          <ShieldCheckIcon size={15} />
          Authorized test identity and captured policy
        </span>
        <span>
          <LockSimpleIcon size={15} />
          No real personal data, payments or additional targets
        </span>
      </div>
      <label className="check-label">
        <input name="stop" type="checkbox" />
        <span>Stop remaining calls after the first policy violation</span>
      </label>
      <label className="check-label">
        <input
          name="campaignAuthorized"
          type="checkbox"
          required
          {...invalid("campaignAuthorized", errors)}
        />
        <span>I authorize this campaign within the scope above.</span>
      </label>
      <FieldError name="campaignAuthorized" errors={errors} />
    </>
  );
}
