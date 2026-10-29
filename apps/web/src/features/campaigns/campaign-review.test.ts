import { describe, expect, it } from "vitest";
import { scopeSchema } from "../../../../../packages/core/src/schemas";
import type { Target } from "../../shared/types";
import {
  campaignPayload,
  captureCampaignReview,
  reviewTargetAvailable,
} from "./campaign-review";

const target: Target = {
  id: "6fe00e50-d7df-429c-bb78-7319f1450491",
  name: "Approved support agent",
  transport: "pstn",
  phone: "+12025550199",
  authorization_reference: "Owner approval for a controlled acceptance test",
  created_at: "2026-10-29T10:00:00.000Z",
};
function inputs() {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    name: "  Contact verification baseline  ",
    target: target.id,
    maxCalls: "6",
    duration: "90",
    window: "45",
    budget: "12.34",
    stop: "on",
  }))
    form.set(name, value);
  return form;
}
function reviewed(form = inputs()) {
  const result = captureCampaignReview(form, [target]);
  if (!result.draft) throw new Error("Expected a valid scope to enter review");
  return result.draft;
}

describe("campaign scope review", () => {
  it("validates scope without requiring final authorization", () => {
    const form = inputs();
    expect(form.has("campaignAuthorized")).toBe(false);
    const result = captureCampaignReview(form, [target]);
    expect(result.errors).toEqual({});
    expect(result.draft?.name).toBe("Contact verification baseline");
  });
  it("captures the exact values shown for final review", () => {
    expect(reviewed()).toEqual({
      name: "Contact verification baseline",
      targetId: target.id,
      targetName: target.name,
      targetPhone: target.phone,
      maxCalls: 6,
      maxDurationSeconds: 90,
      windowMinutes: 45,
      budgetCents: 1234,
      stopOnFinding: true,
    });
  });
  it("does not change reviewed values when editable source fields change", () => {
    const form = inputs(),
      draft = reviewed(form);
    form.set("maxCalls", "20");
    form.set("budget", "100");
    form.set("name", "Changed after review");
    const payload = campaignPayload(draft, Date.parse("2026-10-29T12:00:00Z"));
    expect(payload.name).toBe("Contact verification baseline");
    expect(payload.scope.maxCalls).toBe(6);
    expect(payload.scope.budgetCents).toBe(1234);
    expect(Reflect.set(draft, "maxCalls", 20)).toBe(false);
  });
  it.each([1, 1440])(
    "keeps an exact %i minute window from the final submission anchor",
    (minutes) => {
      const form = inputs();
      form.set("window", String(minutes));
      const draft = reviewed(form),
        submittedAt = Date.parse("2026-10-29T14:00:00.000Z");
      const payload = campaignPayload(draft, submittedAt);
      expect(Date.parse(payload.scope.startsAt)).toBe(submittedAt - 1000);
      expect(
        Date.parse(payload.scope.endsAt) - Date.parse(payload.scope.startsAt),
      ).toBe(minutes * 60000);
      expect(scopeSchema.safeParse(payload.scope).success).toBe(true);
    },
  );
  it("builds the launch payload exclusively from the reviewed scope", () => {
    const draft = reviewed(),
      payload = campaignPayload(draft);
    expect(payload).toMatchObject({
      name: draft.name,
      targetId: draft.targetId,
      mode: "live",
      scope: {
        maxCalls: draft.maxCalls,
        maxDurationSeconds: draft.maxDurationSeconds,
        budgetCents: draft.budgetCents,
        stopOnFinding: draft.stopOnFinding,
        concurrency: 1,
      },
    });
  });
  it("requires an unchanged approved target before launching", () => {
    const draft = reviewed();
    expect(reviewTargetAvailable(draft, [target])).toBe(true);
    expect(reviewTargetAvailable(draft, [])).toBe(false);
    expect(
      reviewTargetAvailable(draft, [{ ...target, phone: "+12025550198" }]),
    ).toBe(false);
    expect(
      reviewTargetAvailable(draft, [{ ...target, name: "Changed target" }]),
    ).toBe(false);
  });
  it("rejects a missing or incomplete approved target", () => {
    expect(captureCampaignReview(inputs(), []).draft).toBeNull();
    expect(
      captureCampaignReview(inputs(), [{ ...target, phone: null }]).errors
        .target,
    ).toBeTruthy();
  });
  it("returns field errors for invalid scope rather than creating a reviewed draft", () => {
    const form = inputs();
    form.set("name", "   ");
    form.set("duration", "39");
    form.set("window", "1441");
    form.set("budget", "12.345");
    const result = captureCampaignReview(form, [target]);
    expect(result.draft).toBeNull();
    expect(Object.keys(result.errors)).toEqual(
      expect.arrayContaining(["name", "duration", "window", "budget"]),
    );
  });
  it("accepts exact name limits and reports names outside those limits", () => {
    for (const [name, accepted] of [
      ["abc", true],
      ["a".repeat(80), true],
      ["ab", false],
      ["a".repeat(81), false],
    ] as const) {
      const form = inputs();
      form.set("name", name);
      const result = captureCampaignReview(form, [target]);
      if (accepted) expect(result.draft?.name).toBe(name);
      else {
        expect(result.draft).toBeNull();
        expect(result.errors.name).toBeTruthy();
      }
    }
  });
  it("rejects an unknown selected target and a malformed approved phone", () => {
    const form = inputs();
    form.set("target", "6fe00e50-d7df-429c-bb78-7319f1450492");
    expect(captureCampaignReview(form, [target]).draft).toBeNull();
    expect(captureCampaignReview(form, [target]).errors.target).toBeTruthy();
    const invalidPhone = captureCampaignReview(inputs(), [
      { ...target, phone: "not-an-international-number" },
    ]);
    expect(invalidPhone.draft).toBeNull();
    expect(invalidPhone.errors.target).toBeTruthy();
  });
  it("reports missing, noninteger and out-of-range numeric scope fields", () => {
    const cases = [
      ["maxCalls", "0"],
      ["maxCalls", "1.5"],
      ["maxCalls", "21"],
      ["maxCalls", "not-a-number"],
      ["maxCalls", ""],
      ["duration", "0"],
      ["duration", "39"],
      ["duration", "301"],
      ["duration", "not-a-number"],
      ["duration", ""],
      ["window", "0"],
      ["window", "1441"],
      ["window", "not-a-number"],
      ["window", ""],
    ];
    for (const [field, value] of cases) {
      const form = inputs();
      form.set(field, value);
      const result = captureCampaignReview(form, [target]);
      expect(result.draft, `${field}=${value}`).toBeNull();
      expect(result.errors[field], `${field}=${value}`).toBeTruthy();
    }
  });
  it("captures exact currency bounds and fractions while rejecting invalid budgets", () => {
    for (const [budget, cents] of [
      ["0", 0],
      ["100", 10000],
      ["0.29", 29],
      ["12.34", 1234],
      ["9.95", 995],
      [".50", 50],
      ["1.", 100],
      ["0.00", 0],
      ["100.00", 10000],
    ] as const) {
      const form = inputs();
      form.set("budget", budget);
      expect(
        captureCampaignReview(form, [target]).draft?.budgetCents,
        budget,
      ).toBe(cents);
    }
    for (const budget of [
      "",
      "-0.01",
      "100.01",
      "12.345",
      "0.00000001",
      "1e-8",
      "not-a-number",
      "Infinity",
    ]) {
      const form = inputs();
      form.set("budget", budget);
      const result = captureCampaignReview(form, [target]);
      expect(result.draft, budget).toBeNull();
      expect(result.errors.budget, budget).toBeTruthy();
    }
  });
});
