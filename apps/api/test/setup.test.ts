import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/database/client";
import { liveReadiness } from "../src/execution/live";
import {
  getSetupStatus,
  type DatabaseSetupProbe,
} from "../src/operations/setup";
import { classifyWorkerHealth } from "../src/operations/health";
import { runWorkerIteration } from "../src/worker";
import {
  isAuthorizedPhoneListConfigured,
  isConfiguredSetting,
} from "../../../packages/core/src/setup";

const checkedAt = "2026-10-29T12:00:00.000Z";
const readyDatabase: DatabaseSetupProbe = {
  state: "ready",
  detail: "Database available",
  fields: [],
  worker: { state: "unavailable", detail: "No worker heartbeat recorded" },
};
const statusDependencies = {
  probeDatabase: async () => readyDatabase,
  readiness: () => ({
    enabled: false,
    missing: [
      "BOLNA_API_KEY",
      "BOLNA_AGENT_ID",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "VALID_TWILIO_CALL_CONTROL",
      "VOUCH_EVIDENCE_SIGNING_KEY",
      "VOUCH_ARTIFACT_KEY",
      "VOUCH_RECORDING_HOSTS",
      "VOUCH_LIVE_ENABLED",
    ],
  }),
  authorization: () => true,
  now: () => new Date(checkedAt),
};
const queryResult = (rows: Record<string, unknown>[]) => ({
  rows,
  rowCount: rows.length,
  command: "SELECT",
  oid: 0,
  fields: [],
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("setup workflow diagnostics", () => {
  it("allows target registration without claiming that provider setup or a worker is ready", async () => {
    const result = await getSetupStatus(statusDependencies);
    expect(result).toMatchObject({
      checkedAt,
      databaseReady: true,
      canRegisterTarget: true,
      liveConfigurationReady: false,
    });
    expect(result.checks.find((check) => check.id === "caller")).toMatchObject({
      state: "action_required",
      fields: ["BOLNA_API_KEY", "BOLNA_AGENT_ID"],
    });
    expect(
      result.checks.find((check) => check.id === "carrier")?.fields,
    ).toEqual(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]);
    expect(
      result.checks.find((check) => check.id === "authorization")?.state,
    ).toBe("ready");
    expect(result.checks.find((check) => check.id === "worker")).toMatchObject({
      state: "unavailable",
      command: "pnpm dev:worker",
    });
  });
  it("blocks target registration until both schema and an authorized allowlist exist", async () => {
    const withoutList = await getSetupStatus({
      ...statusDependencies,
      authorization: () => false,
    });
    expect(withoutList.canRegisterTarget).toBe(false);
    expect(
      withoutList.checks.find((check) => check.id === "authorization")?.state,
    ).toBe("action_required");
    const withoutSchema = await getSetupStatus({
      ...statusDependencies,
      probeDatabase: async () => ({
        ...readyDatabase,
        state: "action_required",
        command: "pnpm db:migrate",
      }),
    });
    expect(withoutSchema.canRegisterTarget).toBe(false);
    expect(
      withoutSchema.checks.find((check) => check.id === "worker")?.state,
    ).toBe("not_checked");
  });
  it("keeps configuration readiness separate from an observed worker or verified call", async () => {
    const result = await getSetupStatus({
      ...statusDependencies,
      readiness: () => ({ enabled: true, missing: [] }),
    });
    expect(result.liveConfigurationReady).toBe(true);
    expect(result.checks.find((check) => check.id === "worker")?.state).toBe(
      "unavailable",
    );
    expect(
      result.checks.find((check) => check.id === "caller")?.detail,
    ).toContain("has not been checked");
  });
  it("does not expose unknown missing values as settings, URLs or response text", async () => {
    const privateValue = "private-provider-credential-https://private.internal";
    const result = await getSetupStatus({
      ...statusDependencies,
      readiness: () => ({ enabled: false, missing: [privateValue] }),
    });
    expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(result.checks.find((check) => check.id === "dispatch")?.state).toBe(
      "action_required",
    );
  });
  it("returns an unavailable status after the bound and cannot become ready from a late probe", async () => {
    vi.useFakeTimers();
    let resolveProbe: (value: DatabaseSetupProbe) => void = () => {};
    const pending = new Promise<DatabaseSetupProbe>((resolve) => {
      resolveProbe = resolve;
    });
    const response = getSetupStatus({
      ...statusDependencies,
      probeDatabase: () => pending,
      timeoutMs: 2500,
    });
    await vi.advanceTimersByTimeAsync(2500);
    const result = await response;
    expect(result.databaseReady).toBe(false);
    expect(result.checks[0]).toMatchObject({
      state: "unavailable",
      detail: expect.stringContaining("timed out"),
    });
    resolveProbe(readyDatabase);
    await Promise.resolve();
    expect(result.canRegisterTarget).toBe(false);
    expect(result.checks.find((check) => check.id === "worker")?.state).toBe(
      "not_checked",
    );
  });
  it("identifies missing or invalid database settings without opening a connection", async () => {
    const query = vi.spyOn(db, "query");
    vi.stubEnv("DATABASE_URL", "");
    const missing = await getSetupStatus({
      ...statusDependencies,
      probeDatabase: undefined,
    });
    expect(missing.checks[0]).toMatchObject({
      state: "action_required",
      fields: ["DATABASE_URL"],
    });
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://test:private-value@db.example.com:6543/postgres",
    );
    const invalid = await getSetupStatus({
      ...statusDependencies,
      probeDatabase: undefined,
    });
    expect(invalid.checks[0].detail).toContain("direct or session-pooler");
    expect(JSON.stringify(invalid)).not.toContain("private-value");
    expect(query).not.toHaveBeenCalled();
  });
  it("distinguishes an incomplete schema from an unreachable database", async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://test:private-value@127.0.0.1:54329/vouch_test",
    );
    const query = vi
      .spyOn(db, "query")
      .mockResolvedValueOnce(queryResult([{ ready: false }]));
    const schema = await getSetupStatus({
      ...statusDependencies,
      probeDatabase: undefined,
    });
    expect(schema.checks[0]).toMatchObject({
      state: "action_required",
      command: "pnpm db:migrate",
    });
    query.mockRejectedValueOnce(
      Object.assign(new Error("private-value at private.internal"), {
        code: "ECONNREFUSED",
      }),
    );
    const unreachable = await getSetupStatus({
      ...statusDependencies,
      probeDatabase: undefined,
    });
    expect(unreachable.checks[0].state).toBe("unavailable");
    expect(JSON.stringify(unreachable)).not.toMatch(
      /private-value|private\.internal/,
    );
  });
  it("classifies missing database roles and rejected credentials as setup work rather than network failure", async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://test:private-value@127.0.0.1:54329/vouch_test",
    );
    const query = vi.spyOn(db, "query");
    query.mockRejectedValueOnce(
      Object.assign(new Error("role missing"), { code: "42704" }),
    );
    const missingRole = await getSetupStatus({
      ...statusDependencies,
      probeDatabase: undefined,
    });
    expect(missingRole.checks[0]).toMatchObject({
      state: "action_required",
      command: "pnpm db:migrate",
    });
    query.mockRejectedValueOnce(
      Object.assign(new Error("password private-value rejected"), {
        code: "28P01",
      }),
    );
    const rejected = await getSetupStatus({
      ...statusDependencies,
      probeDatabase: undefined,
    });
    expect(rejected.checks[0]).toMatchObject({
      state: "action_required",
      fields: ["DATABASE_URL"],
    });
    expect(JSON.stringify(rejected)).not.toContain("private-value");
  });
});

describe("durable worker health", () => {
  it("rejects missing, failed, stale, future and unsuccessful observations", () => {
    const current = {
      state: "healthy",
      checked_at: checkedAt,
      last_success_at: checkedAt,
    };
    const now = Date.parse(checkedAt);
    expect(classifyWorkerHealth(undefined, now).state).toBe("unavailable");
    for (const row of [
      { ...current, state: "failed" },
      { ...current, last_success_at: null },
      { ...current, last_success_at: "2026-10-29T11:59:59.000Z" },
      { ...current, checked_at: "invalid" },
    ])
      expect(classifyWorkerHealth(row, now).state).toBe("unavailable");
    expect(classifyWorkerHealth(current, now + 120001).state).toBe(
      "unavailable",
    );
    expect(classifyWorkerHealth(current, now - 5001).state).toBe("unavailable");
  });
  it("uses database age rather than another container's local clock", () => {
    expect(
      classifyWorkerHealth(
        {
          state: "healthy",
          checked_at: checkedAt,
          last_success_at: checkedAt,
          age_ms: 1000,
        },
        Date.parse(checkedAt) + 3600000,
      ).state,
    ).toBe("ready");
  });
  it("records a healthy heartbeat only after a successful tick, including idle ticks", async () => {
    let resolveTick: (value: boolean) => void = () => {};
    const tickResult = new Promise<boolean>((resolve) => {
      resolveTick = resolve;
    });
    const heartbeat = vi.fn(async () => {});
    const pending = runWorkerIteration(() => tickResult, heartbeat);
    expect(heartbeat).not.toHaveBeenCalled();
    resolveTick(false);
    expect(await pending).toBe(false);
    expect(heartbeat).toHaveBeenCalledExactlyOnceWith("healthy");
  });
  it("records failure without reporting health or hiding the original database error", async () => {
    const failure = new Error("database tick failed");
    const heartbeat = vi.fn(async () => {
      throw new Error("heartbeat storage unavailable");
    });
    await expect(
      runWorkerIteration(async () => {
        throw failure;
      }, heartbeat),
    ).rejects.toBe(failure);
    expect(heartbeat).toHaveBeenCalledExactlyOnceWith("failed");
  });
});

function completeEnvironment() {
  const values = {
    BOLNA_API_KEY: "configured-provider-key",
    BOLNA_AGENT_ID: "caller-agent",
    VOUCH_SYNTHETIC_CHALLENGE: "SANDBOX-1042",
    TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32),
    TWILIO_AUTH_TOKEN: "configured-carrier-token",
    BOLNA_COST_UNIT: "cents",
    BOLNA_COST_CURRENCY: "USD",
    VOUCH_LIVE_ENABLED: "true",
    BOLNA_FINAL_COST_VERIFIED: "true",
    VOUCH_BOLNA_MAX_CENTS_PER_MINUTE: "100",
    VOUCH_BOLNA_SETUP_CENTS: "0",
    VOUCH_RATE_CEILING_CONFIRMED: "true",
    AUTHORIZED_PHONE_NUMBERS: "+12025550199",
    VOUCH_EVIDENCE_SIGNING_KEY: Buffer.alloc(32, 1).toString("base64"),
    VOUCH_ARTIFACT_KEY: Buffer.alloc(32, 2).toString("base64"),
    VOUCH_RECORDING_HOSTS: "recordings.example.com",
  };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}
describe("shared configuration presence", () => {
  it("rejects placeholder settings and malformed operator phone lists", () => {
    expect(isConfiguredSetting("YOUR_BOLNA_API_KEY")).toBe(false);
    expect(isConfiguredSetting("  ")).toBe(false);
    expect(isAuthorizedPhoneListConfigured("+12025550199,not-a-number")).toBe(
      false,
    );
    expect(isAuthorizedPhoneListConfigured("+12025550199,+442079460001")).toBe(
      true,
    );
  });
  it("blocks the actual live gate for placeholder caller values and invalid allowlist entries", () => {
    completeEnvironment();
    expect(liveReadiness().enabled).toBe(true);
    vi.stubEnv("BOLNA_API_KEY", "YOUR_BOLNA_API_KEY");
    expect(liveReadiness()).toMatchObject({
      configured: false,
      enabled: false,
      missing: expect.arrayContaining(["BOLNA_API_KEY"]),
    });
    vi.stubEnv("BOLNA_API_KEY", "configured-provider-key");
    vi.stubEnv("AUTHORIZED_PHONE_NUMBERS", "+12025550199,unapproved-format");
    expect(liveReadiness()).toMatchObject({
      enabled: false,
      missing: expect.arrayContaining(["AUTHORIZED_PHONE_NUMBERS"]),
    });
  });
});
