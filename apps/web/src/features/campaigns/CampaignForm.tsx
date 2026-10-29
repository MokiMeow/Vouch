import {
  ArrowUpRightIcon,
  CheckIcon,
  LockSimpleIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../shared/lib";
import type { Overview, Target } from "../../shared/types";

import {
  campaignPayload,
  captureCampaignReview,
  formValue,
  reviewTargetAvailable,
  type CampaignDraft,
  type FormErrors,
} from "./campaign-review";

type FormType = "campaign" | "target";
type Errors = FormErrors;
export type SetupResult = { type: FormType; id: string; initialRunId?: string };
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
function validateTarget(form: FormData): Errors {
  const errors: Errors = {},
    name = formValue(form, "name"),
    reference = formValue(form, "reference");
  if (name.length < 2 || name.length > 80)
    errors.name =
      "Enter a name between 2 and 80 characters. Spaces alone do not count.";
  if (!/^\+[1-9]\d{7,14}$/.test(formValue(form, "phone")))
    errors.phone =
      "Enter an international phone number starting with + and its country code.";
  if (reference.length < 5 || reference.length > 300)
    errors.reference = "Describe your authorization in 5 to 300 characters.";
  if (form.get("authorized") !== "on")
    errors.authorized = "Confirm that you are authorized to test this target.";
  return errors;
}
function saveTarget(form: FormData) {
  return api("/targets", {
    name: formValue(form, "name"),
    transport: "pstn",
    phone: formValue(form, "phone"),
    authorized: form.get("authorized") === "on",
    authorizationReference: formValue(form, "reference"),
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
function focusProblem(form: HTMLFormElement, errors: Errors) {
  const field = form.elements.namedItem(Object.keys(errors)[0]);
  if (field instanceof HTMLElement) field.focus();
}
export function SetupForm({
  type,
  targets,
  targetId,
  live,
  onSuccess,
  onRegisterTarget,
  onOpenIntegrations,
}: {
  type: FormType;
  targets: Target[];
  targetId?: string;
  live?: Overview["live"];
  onSuccess: (message: string, result?: SetupResult) => void;
  onRegisterTarget?: () => void;
  onOpenIntegrations?: () => void;
}) {
  const [step, setStep] = useState<"scope" | "review">("scope"),
    [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [authorized, setAuthorized] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const submitting = useRef(false),
    completed = useRef(false),
    heading = useRef<HTMLHeadingElement>(null),
    errorPanel = useRef<HTMLDivElement>(null),
    previousStep = useRef(step);
  const content = copy[type],
    campaign = type === "campaign",
    reviewing = campaign && step === "review";
  const eligible = targets.filter((target) => target.transport === "pstn");
  const targetChanged = !!draft && !reviewTargetAvailable(draft, eligible);
  const launchBlocked =
    campaign && (!live?.enabled || !eligible.length || targetChanged);
  useEffect(() => {
    if (previousStep.current !== step) heading.current?.focus();
    previousStep.current = step;
  }, [step]);
  useEffect(() => {
    if (error) errorPanel.current?.focus();
  }, [error]);
  function back() {
    if (submitting.current || completed.current) return;
    setStep("scope");
    setAuthorized(false);
    setError("");
    setErrors({});
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || completed.current) return;
    const element = event.currentTarget;
    setError("");
    if (campaign && !reviewing) {
      const capture = captureCampaignReview(new FormData(element), eligible);
      setErrors(capture.errors);
      if (!capture.draft) {
        focusProblem(element, capture.errors);
        return;
      }
      setDraft(capture.draft);
      setAuthorized(false);
      setStep("review");
      return;
    }
    if (campaign && (launchBlocked || !draft)) {
      setError(
        targetChanged
          ? "The approved target changed. Return to scope and review it again."
          : (live?.reason ??
              "Complete the integration and target setup before launching."),
      );
      return;
    }
    if (campaign && !authorized) {
      const problems = {
        campaignAuthorized: "Authorize the reviewed scope before launching.",
      };
      setErrors(problems);
      focusProblem(element, problems);
      return;
    }
    const form = new FormData(element);
    if (!campaign) {
      const problems = validateTarget(form);
      setErrors(problems);
      if (Object.keys(problems).length) {
        focusProblem(element, problems);
        return;
      }
    }
    submitting.current = true;
    setBusy(true);
    try {
      const response =
        campaign && draft
          ? await api("/campaigns", campaignPayload(draft))
          : await saveTarget(form);
      completed.current = true;
      setSaved(true);
      const result: SetupResult | undefined =
        typeof response?.id === "string"
          ? {
              type,
              id: response.id,
              ...(typeof response.initialRunId === "string"
                ? { initialRunId: response.initialRunId }
                : {}),
            }
          : undefined;
      try {
        await onSuccess(content.success, result);
      } catch {
        setError(
          `${campaign ? "The campaign" : "The target"} was saved. Open the workspace to continue.`,
        );
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The request could not be completed. Please try again.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (campaign && !eligible.length)
    return (
      <section
        className="setup-form campaign-prerequisites"
        aria-label="Campaign setup prerequisites"
      >
        <h3>Add an approved target</h3>
        <p>
          Register a phone number you are authorized to test before creating a
          campaign.
        </p>
        <Prerequisites
          missingTarget
          live={live}
          onRegisterTarget={onRegisterTarget}
          onOpenIntegrations={onOpenIntegrations}
        />
      </section>
    );
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
      {campaign && (
        <>
          <ol className="campaign-steps" aria-label="Campaign setup steps">
            <li aria-current={!reviewing ? "step" : undefined}>1 Scope</li>
            <li aria-current={reviewing ? "step" : undefined}>
              2 Review and launch
            </li>
          </ol>
          <h3 ref={heading} tabIndex={-1}>
            {reviewing ? "Review and launch" : "Set the scope"}
          </h3>
        </>
      )}
      {error && (
        <div
          className="inline-error"
          role="alert"
          ref={errorPanel}
          tabIndex={-1}
        >
          <WarningCircleIcon size={19} />
          {error}
        </div>
      )}
      {campaign && !live?.enabled && (
        <Prerequisites live={live} onOpenIntegrations={onOpenIntegrations} />
      )}
      {!reviewing && <p className="form-intro">{content.intro}</p>}
      <fieldset
        className="campaign-scope-fields"
        hidden={reviewing}
        disabled={reviewing || busy || saved}
        aria-label={campaign ? "Campaign scope" : "Target registration"}
      >
        <label>
          {content.label}
          <input
            autoFocus
            name="name"
            required
            minLength={campaign ? 3 : 2}
            maxLength={80}
            placeholder={
              campaign
                ? "Name this authorized campaign"
                : "Your approved support agent"
            }
            {...invalid("name", errors)}
          />
          <FieldError name="name" errors={errors} />
        </label>
        {campaign ? (
          <CampaignFields
            targets={eligible}
            targetId={targetId}
            errors={errors}
          />
        ) : (
          <TargetFields errors={errors} />
        )}
      </fieldset>
      {reviewing && draft && (
        <>
          <CampaignReview draft={draft} />
          {targetChanged && (
            <p className="inline-error" role="alert">
              The approved target changed. Return to scope and review it again.
            </p>
          )}
          <label className="check-label">
            <input
              name="campaignAuthorized"
              type="checkbox"
              checked={authorized}
              onChange={(event) => setAuthorized(event.target.checked)}
              disabled={busy || saved}
              required
              {...invalid("campaignAuthorized", errors)}
            />
            <span>I authorize this campaign within the reviewed scope.</span>
          </label>
          <FieldError name="campaignAuthorized" errors={errors} />
        </>
      )}
      <div className="campaign-step-actions">
        {reviewing && (
          <button
            className="button secondary"
            type="button"
            disabled={busy || saved}
            onClick={back}
          >
            Back to scope
          </button>
        )}
        <button
          className="button primary submit-button"
          disabled={
            busy || saved || (reviewing && (!authorized || launchBlocked))
          }
        >
          {busy
            ? campaign
              ? "Launching…"
              : "Registering…"
            : saved
              ? "Saved"
              : campaign && !reviewing
                ? "Review campaign"
                : content.submit}
          <ArrowUpRightIcon size={19} />
        </button>
      </div>
      {busy && (
        <p role="status" aria-live="polite">
          {campaign
            ? "Submitting the authorized campaign. Please wait."
            : "Registering the approved target. Please wait."}
        </p>
      )}
      <p className="form-footnote">
        {campaign
          ? reviewing
            ? "Only the explicit launch submits this campaign. Real calls can consume the reviewed budget."
            : "Reviewing the scope does not place a call or create a campaign. The window begins when you launch."
          : "Registration checks authorization and the operator allowlist without placing a call."}
      </p>
    </form>
  );
}
function Prerequisites({
  missingTarget = false,
  live,
  onRegisterTarget,
  onOpenIntegrations,
}: {
  missingTarget?: boolean;
  live?: Overview["live"];
  onRegisterTarget?: () => void;
  onOpenIntegrations?: () => void;
}) {
  return (
    <div className="campaign-prerequisite-actions">
      {!live?.enabled && (
        <p className="inline-error" role="status">
          <WarningCircleIcon size={19} />
          {live?.reason ??
            "Configure the caller and resource controls before launching a campaign."}
        </p>
      )}
      {missingTarget && (
        <a
          className="button primary"
          href="/app/targets"
          onClick={
            onRegisterTarget
              ? (event) => {
                  event.preventDefault();
                  onRegisterTarget();
                }
              : undefined
          }
        >
          Register an approved target
          <ArrowUpRightIcon size={17} />
        </a>
      )}
      {!live?.enabled && (
        <a
          className="button secondary"
          href="/app/integrations"
          onClick={
            onOpenIntegrations
              ? (event) => {
                  event.preventDefault();
                  onOpenIntegrations();
                }
              : undefined
          }
        >
          Open integrations
          <ArrowUpRightIcon size={17} />
        </a>
      )}
    </div>
  );
}
function CampaignReview({ draft }: { draft: CampaignDraft }) {
  const budget = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(draft.budgetCents / 100);
  const rows = [
    ["Campaign", draft.name],
    ["Approved target", `${draft.targetName} · ${draft.targetPhone}`],
    [
      "Call slots",
      `${draft.maxCalls} total with 2 initial slots for the control and adversarial pair`,
    ],
    ["Maximum call duration", `${draft.maxDurationSeconds} seconds`],
    [
      "Authorization window",
      `${draft.windowMinutes} ${draft.windowMinutes === 1 ? "minute" : "minutes"} from launch`,
    ],
    ["Budget ceiling", budget],
    [
      "Stop on finding",
      draft.stopOnFinding
        ? "Stop remaining work after a policy violation"
        : "Continue within the authorized limits",
    ],
  ];
  return (
    <section
      className="campaign-review-summary"
      aria-label="Reviewed campaign scope"
    >
      <dl>
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="form-help">
        One call runs at a time. The server rechecks authorization, budget and
        provider controls before dispatch.
      </p>
    </section>
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
    </>
  );
}
