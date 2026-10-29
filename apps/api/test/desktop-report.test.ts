import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { scopeSchema } from "../../../packages/core/src/schemas";
import { titleForRun } from "../../../packages/core/src/presentation";
import { validationMessage } from "../src/http/validation";
import { pageQuerySchema } from "../src/findings/list";
import {
  readView,
  updateView,
  runHref,
  returnPath,
} from "../../web/src/shared/navigation";
import {
  databaseConnectionConfig,
  DatabaseConfigurationError,
} from "../src/database/client";

describe("desktop report regressions", () => {
  it("restores the full filtered page through a shareable run link", () => {
    const list = "/app/findings?q=Verified+contact&outcome=pass&page=2";
    const detail = runHref("a-known-run", list);
    expect(returnPath(detail)).toBe(list);
    expect(readView(returnPath(detail))).toEqual({
      search: "Verified contact",
      outcome: "pass",
      page: 2,
    });
  });
  it("treats whitespace as no search and resets only the requested state", () => {
    const url = updateView("/app/findings?q=old&outcome=pass&page=2", {
      search: "   ",
      page: 1,
    });
    expect(url).toBe("/app/findings?outcome=pass");
    expect(readView(url)).toEqual({ search: "", outcome: "pass", page: 1 });
  });
  it("preserves literal search punctuation and refuses foreign return links", () => {
    const value = "100%_ verified / control";
    expect(
      readView(updateView("/app/findings", { search: value })).search,
    ).toBe(value);
    expect(returnPath("/app/runs/id?from=https%3A%2F%2Foutside.example")).toBe(
      "/app/findings",
    );
  });
  it("normalizes invalid shared pages and filters without losing the search", () => {
    for (const page of [
      "0",
      "-1",
      "1.5",
      "20002",
      "9007199254740992",
      "invalid",
      "Infinity",
      "",
    ]) {
      expect(
        readView(`/app/findings?q=contact&page=${page}&outcome=unsupported`),
      ).toEqual({
        page: 1,
        search: "contact",
        outcome: "all",
      });
    }
    for (const page of [1, 20001])
      expect(readView(`/app/findings?page=${page}&outcome=unknown`).page).toBe(
        page,
      );
  });
  it("clears the default outcome without discarding an existing search and page", () => {
    expect(
      updateView("/app/findings?q=contact&outcome=pass&page=2", {
        outcome: "all",
      }),
    ).toBe("/app/findings?q=contact&page=2");
    expect(readView("/app/findings?q=" + "a".repeat(500)).search).toBe(
      "a".repeat(300),
    );
  });
  it("uses the current browser view when a run link has no explicit return path", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/app/findings",
        search: "?q=contact&outcome=unknown&page=2",
      },
    });
    try {
      expect(returnPath(runHref("a-known-run"))).toBe(
        "/app/findings?q=contact&outcome=unknown&page=2",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("does not label an unobserved control as verified", () => {
    expect(titleForRun({ scenario: "benign_control" })).toBe(
      "Contact verification control",
    );
    expect(
      titleForRun({ scenario: "benign_control", verdict: { outcome: "pass" } }),
    ).toBe("Verified contact change");
  });
  it("distinguishes an observed non-control violation from attempts with unknown evidence", () => {
    expect(
      titleForRun({
        scenario: "false_authority",
        verdict: { outcome: "violation" },
      }),
    ).toBe("Identity verification bypass");
    for (const verdict of [
      undefined,
      null,
      { outcome: "unknown" },
      { outcome: "pass" },
    ])
      expect(titleForRun({ scenario: "false_authority", verdict })).toBe(
        "False-authority verification test",
      );
    expect(
      titleForRun({
        scenario: "benign_control",
        verdict: { outcome: "unknown" },
      }),
    ).toBe("Contact verification control");
  });
  it("names invalid page and UUID fields without exposing validator internals", () => {
    const query = pageQuerySchema.safeParse({ limit: 0 });
    expect(query.success).toBe(false);
    if (!query.success)
      expect(validationMessage(query.error)).toBe(
        "Page size must be at least 1.",
      );
    const id = z.object({ id: z.uuid() }).safeParse({ id: "39c451b2" });
    if (!id.success)
      expect(validationMessage(id.error)).toBe("Run ID must be a valid UUID.");
    const name = z
      .object({ name: z.string().trim().min(3) })
      .safeParse({ name: "   " });
    if (!name.success)
      expect(validationMessage(name.error)).toBe(
        "Name must contain at least 3 characters.",
      );
  });
  const scope = (minutes: number) => ({
    startsAt: "2026-10-29T00:00:00.000Z",
    endsAt: new Date(
      Date.parse("2026-10-29T00:00:00Z") + minutes * 60000,
    ).toISOString(),
    concurrency: 1,
    maxCalls: 2,
    maxDurationSeconds: 40,
    budgetCents: 0,
    syntheticIdentity: "Alex Morgan / SYN-1042",
    categories: ["false_authority", "benign_control"],
    prohibitedActions: [
      "real_personal_data",
      "real_payments",
      "external_targets",
    ],
    stopOnFinding: true,
  });
  it("accepts exact form boundaries and rejects out-of-range API windows", () => {
    expect(scopeSchema.safeParse(scope(1)).success).toBe(true);
    expect(scopeSchema.safeParse(scope(1440)).success).toBe(true);
    for (const minutes of [0.5, 1441, 100000])
      expect(scopeSchema.safeParse(scope(minutes)).success).toBe(false);
  });
});

describe("Supabase connection contract", () => {
  it("fails closed on placeholders and transaction pooling without leaking URLs", () => {
    for (const value of [
      undefined,
      "postgres://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres",
      "postgres://operator:private@project.pooler.supabase.com:6543/postgres",
      "postgres://operator:private@project.pooler.supabase.com:5432/postgres?pgbouncer=true",
    ]) {
      expect(() => databaseConnectionConfig(value)).toThrow(
        DatabaseConfigurationError,
      );
      try {
        databaseConnectionConfig(value);
      } catch (error) {
        expect(String(error)).not.toContain("operator:private");
      }
    }
  });
  it("requires verified TLS for remote connections", () => {
    const config = databaseConnectionConfig(
      "postgres://operator:private@project.pooler.supabase.com:5432/postgres",
    );
    expect(config.ssl).toMatchObject({
      rejectUnauthorized: true,
      servername: "project.pooler.supabase.com",
    });
    for (const mode of ["disable", "require", "prefer"])
      expect(() =>
        databaseConnectionConfig(
          `postgres://operator:private@db.project.supabase.co:5432/postgres?sslmode=${mode}`,
        ),
      ).toThrow(DatabaseConfigurationError);
  });
  it("supports explicit isolated loopback PostgreSQL without TLS", () => {
    expect(
      databaseConnectionConfig(
        "postgres://operator:private@127.0.0.1:5432/vouch_test",
      ).ssl,
    ).toBe(false);
  });
});
