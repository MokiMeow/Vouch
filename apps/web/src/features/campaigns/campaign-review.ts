import type { Target } from "../../shared/types";

export type CampaignDraft = Readonly<{
  name: string;
  targetId: string;
  targetName: string;
  targetPhone: string;
  maxCalls: number;
  maxDurationSeconds: number;
  windowMinutes: number;
  budgetCents: number;
  stopOnFinding: boolean;
}>;
export type FormErrors = Record<string, string>;
export const formValue = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
const decimalBudget = /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/;

export function captureCampaignReview(form: FormData, targets: Target[]) {
  const errors: FormErrors = {};
  const name = formValue(form, "name");
  if (name.length < 3 || name.length > 80)
    errors.name =
      "Enter a name between 3 and 80 characters. Spaces alone do not count.";
  const target = targets.find(
    (target) =>
      target.id === formValue(form, "target") && target.transport === "pstn",
  );
  if (!target || !target.phone || !/^\+[1-9]\d{7,14}$/.test(target.phone))
    errors.target =
      "Select an approved phone target with a valid international number.";
  for (const [field, minimum, maximum, caption] of [
    ["maxCalls", 2, 20, "Maximum calls"],
    ["duration", 40, 300, "Call duration"],
    ["window", 1, 1440, "Authorized window"],
  ] as const) {
    const input = formValue(form, field),
      number = Number(input);
    if (
      !input ||
      !Number.isInteger(number) ||
      number < minimum ||
      number > maximum
    )
      errors[field] =
        `${caption} must be a whole number between ${minimum} and ${maximum}.`;
  }
  const budgetInput = formValue(form, "budget"),
    budget = Number(budgetInput);
  if (
    !budgetInput ||
    !Number.isFinite(budget) ||
    budget < 0 ||
    budget > 100 ||
    !decimalBudget.test(budgetInput)
  )
    errors.budget =
      "Enter a budget from 0 to 100 USD with no more than two decimal places.";
  if (Object.keys(errors).length || !target?.phone)
    return { draft: null, errors };
  const draft: CampaignDraft = Object.freeze({
    name,
    targetId: target.id,
    targetName: target.name,
    targetPhone: target.phone,
    maxCalls: Number(form.get("maxCalls")),
    maxDurationSeconds: Number(form.get("duration")),
    windowMinutes: Number(form.get("window")),
    budgetCents: Math.round(budget * 100),
    stopOnFinding: form.get("stop") === "on",
  });
  return { draft, errors };
}
export function reviewTargetAvailable(draft: CampaignDraft, targets: Target[]) {
  return targets.some(
    (target) =>
      target.transport === "pstn" &&
      target.id === draft.targetId &&
      target.name === draft.targetName &&
      target.phone === draft.targetPhone,
  );
}
export function campaignPayload(draft: CampaignDraft, now = Date.now()) {
  const startsAt = now - 1000;
  return {
    name: draft.name,
    targetId: draft.targetId,
    mode: "live",
    scope: {
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(startsAt + draft.windowMinutes * 60000).toISOString(),
      concurrency: 1,
      maxCalls: draft.maxCalls,
      maxDurationSeconds: draft.maxDurationSeconds,
      budgetCents: draft.budgetCents,
      syntheticIdentity: "Alex Morgan / SYN-1042",
      categories: ["false_authority", "benign_control"],
      prohibitedActions: [
        "real_personal_data",
        "real_payments",
        "external_targets",
      ],
      stopOnFinding: draft.stopOnFinding,
    },
  };
}
