import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import pg from "pg";
import { z } from "zod";
import { policy } from "../../packages/core/src/policy";
import { chromium } from "playwright";

// Never accept an external connection URL. All writes are confined to a newly
// created disposable cluster and its explicitly test-suffixed database.
const databaseName = "vouch_report_test";
const databaseUser = "vouch_report_owner";
const containerName = `vouch-report-regression-${randomBytes(6).toString("hex")}`;
const password = randomBytes(32).toString("hex");
const apiPort = 4063;
const origin = `http://127.0.0.1:${apiPort}`;
const workspaceId = "00000000-0000-4000-8000-000000000001";
const tempDirectory = await mkdtemp(join(tmpdir(), "vouch-api-report-"));
const checks: string[] = [];
let containerCreated = false;
let api: ChildProcess | undefined;
let worker: ChildProcess | undefined;
let apiLog = "";
let admin: pg.Pool | undefined;
let endApplicationDatabase: (() => Promise<void>) | undefined;
let databaseUrl = "";
let firstUseAssertions = 0;
const savedEnvironment = { ...process.env };
const cleanEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) =>
      !/^(?:DATABASE_|TEST_DATABASE_URL$|SUPABASE_|PG[A-Z_]+$|BOLNA_|TWILIO_|VOUCH_|DOTENV_|AUTHORIZED_PHONE_NUMBERS$|PUBLIC_ORIGIN$|HOST$|PORT$|NODE_ENV$)/.test(
        name,
      ),
  ),
);
const dockerEnvironment = { ...cleanEnvironment };
for (const name of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete dockerEnvironment[name];
function docker(args: string[], extraEnvironment: Record<string, string> = {}) {
  return execFileSync(
    "docker",
    ["--host=unix:///var/run/docker.sock", ...args],
    {
      env: { ...dockerEnvironment, ...extraEnvironment },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}
function check(condition: unknown, description: string) {
  assert.ok(condition, description);
  checks.push(description);
}
function equal(actual: unknown, expected: unknown, description: string) {
  assert.deepEqual(actual, expected, description);
  checks.push(description);
}
const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
function safeLog() {
  return apiLog
    .replaceAll(password, "[redacted]")
    .replaceAll(databaseUrl, "[redacted]")
    .slice(-5000);
}
async function stopApi() {
  if (!api || api.exitCode !== null || api.signalCode !== null) return;
  const child = api;
  const closed = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill("SIGTERM");
  await Promise.race([closed, delay(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await closed;
  }
  api = undefined;
}
function applicationEnvironment(mode: "local" | "session") {
  return {
    ...cleanEnvironment,
    DATABASE_URL: databaseUrl,
    DATABASE_MIGRATION_URL: databaseUrl,
    DATABASE_RUNTIME_ROLE: databaseUser,
    DOTENV_CONFIG_PATH: join(tempDirectory, "absent.env"),
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: String(apiPort),
    PUBLIC_ORIGIN: origin,
    VOUCH_AUTH_MODE: mode,
    VOUCH_COOKIE_SECURE: "false",
    VOUCH_LIVE_ENABLED: "false",
    VOUCH_WORKER_HEARTBEAT_FILE: join(tempDirectory, "absent-worker-heartbeat"),
    AUTHORIZED_PHONE_NUMBERS: "+12025550199",
    VOUCH_BOOTSTRAP_EMAIL: "report-owner@example.test",
    VOUCH_BOOTSTRAP_PASSWORD: password,
  };
}
async function startApi(mode: "local" | "session") {
  await stopApi();
  apiLog = "";
  api = spawn(process.execPath, ["--import", "tsx", "apps/api/src/server.ts"], {
    cwd: process.cwd(),
    env: applicationEnvironment(mode),
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [api.stdout, api.stderr])
    stream?.on("data", (chunk: Buffer) => {
      apiLog = (apiLog + chunk.toString("utf8")).slice(-64000);
    });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (api.exitCode !== null || api.signalCode !== null)
      throw new Error(`Isolated API exited before readiness. ${safeLog()}`);
    try {
      const response = await fetch(`${origin}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      /* Keep waiting for this specific child process. */
    }
    await delay(200);
  }
  throw new Error(`Isolated API readiness timed out. ${safeLog()}`);
}
async function request(
  path: string,
  options: {
    body?: unknown;
    cookie?: string;
    csrf?: string;
    method?: string;
  } = {},
) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      Origin: origin,
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.csrf ? { "X-Vouch-Csrf": options.csrf } : {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(10000),
  });
  const body: unknown = await response.json();
  return { response, body, status: response.status };
}
const errorSchema = z.object({ error: z.string() });
const findingSchema = z.object({
  id: z.uuid(),
  scenario: z.string(),
  campaign_name: z.string(),
  verdict: z.object({ outcome: z.string() }),
});
const findingsSchema = z.object({
  runs: z.array(findingSchema),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    totalRuns: z.number(),
    hasMore: z.boolean(),
  }),
});
async function findings(query = "") {
  const result = await request(`/api/findings${query ? `?${query}` : ""}`);
  equal(
    result.status,
    200,
    `Findings request succeeds for ${query || "defaults"}`,
  );
  return findingsSchema.parse(result.body);
}
function scope(minutes = 60) {
  const startsAt = new Date(Date.now() - 1000).toISOString();
  return {
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + minutes * 60000).toISOString(),
    concurrency: 1,
    maxCalls: 2,
    maxDurationSeconds: 60,
    budgetCents: 1000,
    syntheticIdentity: "Alex Morgan / SYN-1042",
    categories: ["false_authority", "benign_control"],
    prohibitedActions: [
      "real_personal_data",
      "real_payments",
      "external_targets",
    ],
    stopOnFinding: false,
  };
}
const setupSchema = z.object({
  checkedAt: z.iso.datetime(),
  databaseReady: z.boolean(),
  canRegisterTarget: z.boolean(),
  liveConfigurationReady: z.boolean(),
  checks: z.array(
    z.object({
      id: z.enum([
        "database",
        "caller",
        "carrier",
        "authorization",
        "evidence",
        "billing",
        "dispatch",
        "worker",
      ]),
      title: z.string(),
      state: z.enum(["ready", "action_required", "unavailable", "not_checked"]),
      detail: z.string(),
      fields: z.array(z.string()),
      docsPath: z.string(),
      command: z.string().optional(),
    }),
  ),
});
async function assertSetupStatus() {
  const response = await request("/api/setup");
  equal(
    response.status,
    200,
    "Actual setup diagnostics endpoint responds without provider credentials",
  );
  const setup = setupSchema.parse(response.body);
  equal(
    setup.databaseReady,
    true,
    "Setup reports the authenticated isolated database connection ready",
  );
  equal(
    setup.canRegisterTarget,
    true,
    "Setup permits target registration with database and operator allowlist",
  );
  equal(
    setup.liveConfigurationReady,
    false,
    "Setup does not mark missing live configuration ready",
  );
  equal(
    setup.checks.length,
    8,
    "Setup returns all eight actionable prerequisite checks",
  );
  const byId = new Map(setup.checks.map((item) => [item.id, item]));
  equal(
    byId.get("database")?.state,
    "ready",
    "Database checklist state reflects a working migrated database",
  );
  equal(
    byId.get("authorization")?.state,
    "ready",
    "Authorization checklist detects the configured target allowlist",
  );
  for (const id of [
    "caller",
    "carrier",
    "evidence",
    "billing",
    "dispatch",
  ] as const)
    equal(
      byId.get(id)?.state,
      "action_required",
      `Missing ${id} setup remains an actionable prerequisite`,
    );
  equal(
    byId.get("worker")?.state,
    "unavailable",
    "Setup detects that no actual worker heartbeat exists",
  );
  check(
    !JSON.stringify(setup).includes(password) &&
      !JSON.stringify(setup).includes(databaseUrl),
    "Diagnostics do not return configured secrets or connection URLs",
  );
  check(
    setup.checks.every((item) => item.docsPath.startsWith("/docs")),
    "Every setup prerequisite links to actual public guidance",
  );
  return setup;
}

async function firstUseJourney() {
  const initialChecks = checks.length;
  assert.ok(admin);
  await startApi("local");
  const setup = await assertSetupStatus();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request_) => {
    const requested = new URL(request_.url());
    if (requested.origin !== origin && requested.protocol !== "data:")
      externalRequests.push(requested.origin);
  });
  await mkdir("artifacts/functional-journey", { recursive: true });
  try {
    await page.goto(`${origin}/app`);
    await page
      .getByRole("heading", {
        name: "Start with an approved target",
        exact: true,
      })
      .waitFor();
    check(
      await page
        .getByRole("button", {
          name: "Register your first target",
          exact: true,
        })
        .isVisible(),
      "Fresh overview offers an actionable first target registration",
    );
    equal(
      (await admin.query("SELECT count(*)::int AS count FROM targets")).rows[0]
        .count,
      0,
      "First-use browser journey begins without seeded targets",
    );
    equal(
      (await admin.query("SELECT count(*)::int AS count FROM runs")).rows[0]
        .count,
      0,
      "First-use browser journey begins without simulated conversations",
    );
    await page.screenshot({
      path: "artifacts/functional-journey/first-use.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Register your first target", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const name = `Operator-entered target ${randomBytes(3).toString("hex")}`;
    const reference =
      "Operator approval entered through actual registration form";
    await dialog.getByLabel("Target name", { exact: true }).fill(name);
    await dialog
      .getByLabel("Approved international phone number", { exact: true })
      .fill("+12025550199");
    await dialog
      .getByLabel("Authorization reference", { exact: true })
      .fill(reference);
    await dialog
      .getByRole("checkbox", {
        name: "I own this target or have explicit authorization to test it.",
        exact: true,
      })
      .check();
    await dialog
      .getByRole("button", { name: "Register target", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/app/targets" && url.searchParams.has("created"),
    );
    await page.getByText(name, { exact: true }).waitFor();
    check(
      await page.getByText(name, { exact: true }).isVisible(),
      "Successful registration navigates to Targets and displays the entered target",
    );
    const stored = (
      await admin.query(
        "SELECT id,name,phone,authorization_reference FROM targets WHERE name=$1 AND workspace_id=$2",
        [name, workspaceId],
      )
    ).rows;
    equal(
      stored.length,
      1,
      "Actual registration API persists exactly one user-entered target",
    );
    equal(
      stored[0].phone,
      "+12025550199",
      "Actual registration preserves the approved phone input",
    );
    equal(
      stored[0].authorization_reference,
      reference,
      "Actual registration preserves the operator authorization reference",
    );
    equal(
      new URL(page.url()).searchParams.get("created"),
      stored[0].id,
      "Registration success route identifies the actual stored target",
    );
    await page.reload();
    await page.getByText(name, { exact: true }).waitFor();
    check(
      await page.getByText(name, { exact: true }).isVisible(),
      "Target remains visible after a real direct-page reload",
    );
    await page.screenshot({
      path: "artifacts/functional-journey/registered-target.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Create campaign", exact: true })
      .first()
      .click();
    await page.waitForURL((url) => url.pathname === "/app/integrations");
    await page
      .getByRole("heading", { name: "Workspace setup", exact: true })
      .waitFor();
    check(
      await page
        .getByRole("heading", { name: "Workspace setup", exact: true })
        .isVisible(),
      "Blocked campaign intent navigates to actionable workspace setup",
    );
    equal(
      await page.getByRole("dialog").count(),
      0,
      "Blocked campaign intent does not strand the user in a disabled form",
    );
    for (const item of setup.checks) {
      await page.getByText(item.title, { exact: true }).first().waitFor();
      const summary = page.locator("summary").filter({ hasText: item.title });
      const detail = page.getByText(item.detail, { exact: true }).first();
      if (!(await detail.isVisible())) await summary.click();
      await detail.waitFor({ state: "visible" });
      check(
        await detail.isVisible(),
        `Setup UI displays actual diagnostics for ${item.id}`,
      );
      const stateLabels = {
        ready: "Ready",
        action_required: "Action needed",
        unavailable: "Unavailable",
        not_checked: "Not checked",
      };
      check(
        await summary
          .getByText(stateLabels[item.state], { exact: true })
          .isVisible(),
        `Setup UI reflects the measured ${item.id} state`,
      );
    }
    const refreshResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/setup" &&
        response.request().method() === "GET",
    );
    await page
      .getByRole("button", { name: "Check setup", exact: true })
      .click();
    equal(
      (await refreshResponse).status(),
      200,
      "Check setup fetches actual current diagnostics without a provider request",
    );
    await page.screenshot({
      path: "artifacts/functional-journey/setup-diagnostics.png",
      fullPage: true,
    });
    await page.goto(
      `${origin}/app/findings?q=no-such-conversation&outcome=violation&page=2`,
    );
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .waitFor();
    check(
      await page
        .getByRole("button", { name: "Clear filters", exact: true })
        .isVisible(),
      "Empty filtered findings provide a working filter reset action",
    );
    equal(
      await page
        .getByRole("textbox", { name: "Search all findings", exact: true })
        .inputValue(),
      "no-such-conversation",
      "Filtered findings reflect the bookmarked search before reset",
    );
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        !url.searchParams.has("q") &&
        !url.searchParams.has("outcome") &&
        !url.searchParams.has("page"),
    );
    equal(
      await page
        .getByRole("textbox", { name: "Search all findings", exact: true })
        .inputValue(),
      "",
      "Filter reset clears the actual findings search input",
    );
    equal(
      await page
        .getByRole("combobox", { name: "Filter outcomes", exact: true })
        .inputValue(),
      "all",
      "Filter reset restores the all-outcomes selection",
    );
    await page.reload();
    await page
      .getByRole("textbox", { name: "Search all findings", exact: true })
      .waitFor();
    equal(
      await page
        .getByRole("textbox", { name: "Search all findings", exact: true })
        .inputValue(),
      "",
      "Reset findings state survives direct reload",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    check(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )),
      "Actual first-use findings fit a phone viewport without horizontal overflow",
    );
    await page.screenshot({
      path: "artifacts/functional-journey/empty-findings-mobile.png",
      fullPage: true,
    });
    equal(
      (await admin.query("SELECT count(*)::int AS count FROM targets")).rows[0]
        .count,
      1,
      "First-use browser actions persist only the explicitly registered target",
    );
    equal(
      (await admin.query("SELECT count(*)::int AS count FROM campaigns"))
        .rows[0].count,
      0,
      "Incomplete prerequisites cannot create a campaign through browser actions",
    );
    equal(
      (await admin.query("SELECT count(*)::int AS count FROM runs")).rows[0]
        .count,
      0,
      "First-use browser actions create no fake conversation evidence or dispatch jobs",
    );
    equal(
      externalRequests,
      [],
      "Functional browser journey makes no external provider or third-party requests",
    );
    equal(
      errors,
      [],
      "Actual browser-to-API journey completes without page errors",
    );
  } catch (error) {
    await page
      .screenshot({
        path: "artifacts/functional-journey/failure.png",
        fullPage: true,
      })
      .catch(() => undefined);
    throw error;
  } finally {
    await browser.close();
  }
  firstUseAssertions = checks.length - initialChecks;
}

async function stopWorker() {
  if (!worker || worker.exitCode !== null || worker.signalCode !== null) return;
  const child = worker;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill("SIGTERM");
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
  worker = undefined;
}
async function zeroJobWorkerJourney() {
  assert.ok(admin);
  const jobs = (
    await admin.query(
      "SELECT (SELECT count(*) FROM campaigns)::int AS campaigns,(SELECT count(*) FROM runs)::int AS runs,(SELECT count(*) FROM live_executions)::int AS executions",
    )
  ).rows[0];
  equal(
    jobs,
    { campaigns: 0, runs: 0, executions: 0 },
    "Real worker heartbeat acceptance starts only in a fresh zero-job database",
  );
  // This guarded zero-job process is stopped before any report test records are
  // inserted. Its live switch is off and no provider credentials are inherited.
  worker = spawn(
    process.execPath,
    ["--import", "tsx", "apps/api/src/worker.ts"],
    {
      cwd: process.cwd(),
      env: applicationEnvironment("local"),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let workerLog = "";
  for (const stream of [worker.stdout, worker.stderr])
    stream?.on("data", (chunk: Buffer) => {
      workerLog = (workerLog + chunk.toString("utf8")).slice(-4000);
    });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (worker.exitCode !== null || worker.signalCode !== null)
        throw new Error(
          `Isolated zero-job worker exited before readiness. ${workerLog.replaceAll(password, "[redacted]").replaceAll(databaseUrl, "[redacted]")}`,
        );
      const response = await request("/api/setup");
      const setup = setupSchema.parse(response.body);
      if (
        setup.checks.find((item) => item.id === "worker")?.state === "ready"
      ) {
        ready = true;
        break;
      }
      await delay(200);
    }
    check(
      ready,
      "Actual zero-job worker records a successful shared database heartbeat",
    );
    execFileSync(
      process.execPath,
      ["--import", "tsx", "apps/api/src/operations/health.ts", "worker-health"],
      {
        env: applicationEnvironment("local"),
        stdio: "pipe",
        timeout: 10000,
      },
    );
    check(
      true,
      "Real worker health CLI accepts the matching healthy file and database instance",
    );
  } finally {
    await stopWorker();
  }
  equal(
    (await admin.query("SELECT count(*)::int AS count FROM runs")).rows[0]
      .count,
    0,
    "Zero-job worker acceptance creates no dispatch runs",
  );
  await admin.query(
    "UPDATE service_heartbeats SET checked_at=now()-interval '121 seconds',last_success_at=now()-interval '121 seconds'",
  );
  const stale = setupSchema.parse((await request("/api/setup")).body);
  equal(
    stale.checks.find((item) => item.id === "worker")?.state,
    "unavailable",
    "Shared diagnostics reject an expired worker heartbeat",
  );
  let rejectedStale = false;
  try {
    execFileSync(
      process.execPath,
      ["--import", "tsx", "apps/api/src/operations/health.ts", "worker-health"],
      {
        env: applicationEnvironment("local"),
        stdio: "pipe",
        timeout: 10000,
      },
    );
  } catch {
    rejectedStale = true;
  }
  check(
    rejectedStale,
    "Health CLI rejects stale database status even while its file mirror exists",
  );
  await admin.query(
    "UPDATE service_heartbeats SET state='failed',checked_at=now()",
  );
  const failed = setupSchema.parse((await request("/api/setup")).body);
  equal(
    failed.checks.find((item) => item.id === "worker")?.state,
    "unavailable",
    "Shared diagnostics reject an explicit failed worker tick",
  );
  check(
    /failed/i.test(
      failed.checks.find((item) => item.id === "worker")?.detail ?? "",
    ),
    "Failed heartbeat diagnostics explain the worker database-tick failure",
  );
}

const records: {
  runId: string;
  campaignId: string;
  outcome: string;
  scenario: string;
  name: string;
}[] = [];
async function seedRecords() {
  assert.ok(admin);
  const targetId = randomUUID();
  await admin.query(
    "INSERT INTO targets(id,name,transport,phone,authorization_reference,workspace_id) VALUES($1,$2,'pstn',$3,$4,$5)",
    [
      targetId,
      "Report regression target",
      "+12025550199",
      "ISOLATED TEST ONLY NO CALLS",
      workspaceId,
    ],
  );
  const { configurationHash, CONFIG_HASH_ALGORITHM } =
    await import("../../apps/api/src/campaigns/configuration");
  for (let index = 0; index < 72; index++) {
    const campaignId = randomUUID();
    const runId = randomUUID();
    const currentScope = scope();
    const config = {
      mode: "live",
      scope: currentScope,
      policy,
      testOnlyMetadata: true,
    };
    const name =
      index === 0
        ? "Exact 50%_literal marker"
        : index === 1
          ? "Needle beyond first page"
          : index === 2
            ? "Percent-only marker % \\literalbackslash"
            : `Report verification ${index}`;
    const outcome = ["violation", "pass", "unknown"][index % 3];
    const scenario = index % 4 === 0 ? "benign_control" : "false_authority";
    const created = new Date(Date.now() - (72 - index) * 1000).toISOString();
    const verdict = {
      outcome,
      tier: "transcript_only",
      title: "Test-only report metadata",
      reasons: [],
      state: "unknown",
    };
    await admin.query(
      "INSERT INTO campaigns(id,name,target_id,mode,scope,config,config_hash,config_hash_algorithm,status,calls_used,workspace_id,created_at) VALUES($1,$2,$3,'live',$4,$5,$6,$7,'completed',2,$8,$9)",
      [
        campaignId,
        name,
        targetId,
        currentScope,
        config,
        configurationHash(config),
        CONFIG_HASH_ALGORITHM,
        workspaceId,
        created,
      ],
    );
    await admin.query(
      "INSERT INTO runs(id,campaign_id,scenario,status,synthetic,config,verdict,workspace_id,created_at,finished_at) VALUES($1,$2,$3,'completed',false,$4,$5,$6,$7,$7)",
      [runId, campaignId, scenario, config, verdict, workspaceId, created],
    );
    records.push({ runId, campaignId, outcome, scenario, name });
  }
  return targetId;
}
async function main() {
  check(
    databaseName.endsWith("_test"),
    "Dedicated database has required test suffix",
  );
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(apiPort, "127.0.0.1", () =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
  });
  docker(["info", "--format", "{{.ServerVersion}}"]);
  docker(["image", "inspect", "postgres:17-alpine", "--format", "{{.Id}}"]);
  docker(
    [
      "run",
      "--pull=never",
      "--rm",
      "--detach",
      "--name",
      containerName,
      "--publish",
      "127.0.0.1::5432",
      "--mount",
      "type=tmpfs,destination=/var/lib/postgresql/data,tmpfs-size=268435456",
      "--env",
      "POSTGRES_USER",
      "--env",
      "POSTGRES_PASSWORD",
      "--env",
      "POSTGRES_DB",
      "postgres:17-alpine",
    ],
    {
      POSTGRES_USER: databaseUser,
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: databaseName,
    },
  );
  containerCreated = true;
  const binding = docker(["port", containerName, "5432/tcp"]);
  const port = Number(/^127\.0\.0\.1:(\d+)$/.exec(binding)?.[1]);
  check(
    Number.isInteger(port) && port > 0,
    "Disposable database binds an allocated loopback port",
  );
  databaseUrl = `postgres://${databaseUser}:${password}@127.0.0.1:${port}/${databaseName}`;
  for (const key of Object.keys(process.env))
    if (
      /^(?:DATABASE_|TEST_DATABASE_URL$|SUPABASE_|PG[A-Z_]+$|BOLNA_|TWILIO_|VOUCH_|DOTENV_|AUTHORIZED_PHONE_NUMBERS$|PUBLIC_ORIGIN$|HOST$|PORT$|NODE_ENV$)/.test(
        key,
      )
    )
      delete process.env[key];
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    DATABASE_MIGRATION_URL: databaseUrl,
    DATABASE_RUNTIME_ROLE: databaseUser,
    DOTENV_CONFIG_PATH: join(tempDirectory, "absent.env"),
    VOUCH_AUTH_MODE: "local",
    VOUCH_LIVE_ENABLED: "false",
    NODE_ENV: "test",
    HOST: "127.0.0.1",
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      docker([
        "exec",
        containerName,
        "pg_isready",
        "-U",
        databaseUser,
        "-d",
        databaseName,
      ]);
      break;
    } catch {
      if (attempt === 99)
        throw new Error("Disposable PostgreSQL readiness timed out");
      await delay(200);
    }
  }
  admin = new pg.Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 3000,
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await admin.query("SELECT 1");
      break;
    } catch {
      if (attempt === 99)
        throw new Error(
          "Authenticated disposable database TCP readiness timed out",
        );
      await delay(200);
    }
  }
  const { migrate } = await import("../../apps/api/src/migrate");
  const { listMigrationFiles } =
    await import("../../apps/api/src/database/migration-source");
  const database = await import("../../apps/api/src/database/client");
  endApplicationDatabase = database.db.end;
  await migrate({ databaseUrl, runtimeRole: databaseUser });
  const firstLedger = (
    await admin.query(
      "SELECT version,name,checksum,applied_at FROM vouch_schema_migrations ORDER BY version",
    )
  ).rows;
  equal(
    firstLedger.length,
    (await listMigrationFiles()).length,
    "Fresh database applies every versioned migration",
  );
  await migrate({ databaseUrl, runtimeRole: databaseUser });
  equal(
    (
      await admin.query(
        "SELECT version,name,checksum,applied_at FROM vouch_schema_migrations ORDER BY version",
      )
    ).rows,
    firstLedger,
    "Repeated migration preserves ledger and application timestamps",
  );
  equal(
    (
      await admin.query(
        "SELECT (SELECT count(*) FROM targets)::int AS targets,(SELECT count(*) FROM campaigns)::int AS campaigns,(SELECT count(*) FROM runs)::int AS runs",
      )
    ).rows[0],
    { targets: 0, campaigns: 0, runs: 0 },
    "Fresh migrations do not seed targets campaigns or simulated evidence",
  );
  await admin.query(
    "UPDATE vouch_schema_migrations SET checksum=$1 WHERE version=0",
    ["0".repeat(64)],
  );
  let rejectedChecksum = false;
  try {
    await migrate({ databaseUrl, runtimeRole: databaseUser });
  } catch (error) {
    rejectedChecksum =
      error instanceof Error && /checksum|filename differs/.test(error.message);
  } finally {
    await admin.query(
      "UPDATE vouch_schema_migrations SET checksum=$1 WHERE version=0",
      [firstLedger[0].checksum],
    );
  }
  check(
    rejectedChecksum,
    "Migration runner rejects an altered applied checksum without rewriting SQL",
  );
  await migrate({ databaseUrl, runtimeRole: databaseUser });
  equal(
    (
      await admin.query(
        "SELECT version,name,checksum,applied_at FROM vouch_schema_migrations ORDER BY version",
      )
    ).rows,
    firstLedger,
    "Restoring isolated ledger checksum permits unchanged migrations again",
  );
  await firstUseJourney();
  await zeroJobWorkerJourney();
  const targetId = await seedRecords();
  equal(
    (
      await database.withWorkspaceDatabase(workspaceId, () =>
        database.db.query("SELECT count(*)::int AS count FROM runs"),
      )
    ).rows[0].count,
    72,
    "Workspace database context reads its own test records",
  );
  equal(
    (await database.db.query("SELECT count(*)::int AS count FROM runs")).rows[0]
      .count,
    0,
    "Database access without workspace context cannot read tenant rows",
  );
  const otherWorkspace = randomUUID();
  await admin.query("INSERT INTO vouch_workspaces(id,name) VALUES($1,$2)", [
    otherWorkspace,
    "Other isolated workspace",
  ]);
  equal(
    (
      await database.withWorkspaceDatabase(otherWorkspace, () =>
        database.db.query("SELECT count(*)::int AS count FROM runs"),
      )
    ).rows[0].count,
    0,
    "A separate workspace cannot read another workspace's report records",
  );
  let rejectedCrossWorkspace = false;
  try {
    await database
      .withWorkspaceDatabase(otherWorkspace, () =>
        database.db.query(
          "UPDATE runs SET review='confirmed' WHERE id=$1 RETURNING id",
          [records[0].runId],
        ),
      )
      .then((value) => {
        rejectedCrossWorkspace = value.rowCount === 0;
      });
  } catch {
    rejectedCrossWorkspace = true;
  }
  check(rejectedCrossWorkspace, "RLS blocks cross-workspace report mutation");
  await startApi("local");
  const overview = await request("/api/overview");
  equal(overview.status, 200, "Actual isolated API serves the overview");
  const overviewBody = z
    .object({
      campaigns: z.array(z.object({ id: z.uuid() })),
      summary: z.object({ campaigns: z.number(), totalRuns: z.number() }),
      pagination: z.object({
        hasMore: z.boolean(),
        totalCampaigns: z.number(),
      }),
    })
    .parse(overview.body);
  equal(
    overviewBody.campaigns.length,
    50,
    "Overview defaults to a bounded campaign page",
  );
  equal(
    overviewBody.summary.campaigns,
    72,
    "Overview counts include campaigns outside the loaded page",
  );
  equal(
    overviewBody.summary.totalRuns,
    72,
    "Overview counts include all non-simulated report metadata",
  );
  check(
    overviewBody.pagination.hasMore,
    "Overview exposes additional page availability",
  );
  const first = await findings();
  equal(first.runs.length, 50, "Findings defaults to a bounded first page");
  equal(
    first.pagination.totalRuns,
    72,
    "Findings count includes the complete dataset",
  );
  const second = await findings("offset=50");
  equal(
    second.runs.length,
    22,
    "Findings offset returns the remaining report records",
  );
  equal(
    second.pagination.hasMore,
    false,
    "Last findings page has no further page",
  );
  equal(
    new Set([...first.runs, ...second.runs].map((row) => row.id)).size,
    72,
    "Findings pagination neither repeats nor omits records",
  );
  const needle = await findings("search=Needle");
  equal(
    needle.pagination.totalRuns,
    1,
    "Global search finds an older record beyond the overview first page",
  );
  equal(
    needle.runs[0].id,
    records[1].runId,
    "Global search returns the actual older matching run",
  );
  const whitespace = await findings(
    `search=${encodeURIComponent("  nEeDlE \t ")}`,
  );
  equal(
    whitespace.runs.map((row) => row.id),
    needle.runs.map((row) => row.id),
    "Search trims outer whitespace and matches case insensitively",
  );
  equal(
    (await findings(`search=${encodeURIComponent("50%_literal")}`)).pagination
      .totalRuns,
    1,
    "SQL percent and underscore characters are treated literally",
  );
  equal(
    (await findings("search=%25")).pagination.totalRuns,
    2,
    "Literal percent search does not become a SQL wildcard",
  );
  equal(
    (await findings(`search=${encodeURIComponent("50%Zliteral")}`)).pagination
      .totalRuns,
    0,
    "An underscore in stored text cannot act as a wildcard",
  );
  equal(
    (await findings(`search=${encodeURIComponent("\\literalbackslash")}`))
      .pagination.totalRuns,
    1,
    "Backslash search remains literal through the SQL escape boundary",
  );
  const title = await findings(
    `search=${encodeURIComponent("Identity verification bypass")}`,
  );
  equal(
    title.pagination.totalRuns,
    records.filter(
      (row) => row.scenario !== "benign_control" && row.outcome === "violation",
    ).length,
    "Search matches the displayed violation title",
  );
  const control = await findings(
    `search=${encodeURIComponent("Verified contact change")}`,
  );
  equal(
    control.pagination.totalRuns,
    records.filter(
      (row) => row.scenario === "benign_control" && row.outcome === "pass",
    ).length,
    "Search matches the displayed verified benign control title",
  );
  const pendingControl = await findings(
    `search=${encodeURIComponent("Contact verification control")}`,
  );
  equal(
    pendingControl.pagination.totalRuns,
    records.filter(
      (row) => row.scenario === "benign_control" && row.outcome !== "pass",
    ).length,
    "Control titles do not describe failed or unknown verification as verified",
  );
  for (const outcome of ["violation", "pass", "unknown"]) {
    const result = await findings(`outcome=${outcome}`);
    equal(
      result.pagination.totalRuns,
      24,
      `Outcome filter ${outcome} uses all report records`,
    );
    check(
      result.runs.every((row) => row.verdict.outcome === outcome),
      `Outcome filter ${outcome} returns only matching rows`,
    );
  }
  const empty = await findings("search=no-such-report-record-7319");
  equal(empty.runs, [], "Unmatched report searches return an empty page");
  equal(
    empty.pagination.totalRuns,
    0,
    "Unmatched report search has zero total count",
  );
  const offsetPast = await findings("offset=1000");
  equal(offsetPast.runs, [], "Offsets beyond the last page return no rows");
  equal(
    offsetPast.pagination.totalRuns,
    72,
    "Offsets beyond the last page preserve global total",
  );
  for (const query of [
    "limit=101",
    "limit=0",
    "limit=1.5",
    "offset=-1",
    "offset=1000001",
    "outcome=unexpected",
    `search=${"x".repeat(301)}`,
  ]) {
    const result = await request(`/api/findings?${query}`);
    equal(
      result.status,
      400,
      `Invalid findings query is rejected for ${query.slice(0, 30)}`,
    );
    const message = errorSchema.parse(result.body).error;
    check(
      message.length > 0 &&
        !message.includes('"code"') &&
        !message.includes("Zod"),
      `Invalid findings query has a readable validation message for ${query.slice(0, 30)}`,
    );
  }
  const badId = await request("/api/runs/not-a-uuid");
  equal(badId.status, 400, "Malformed run identifier returns a client error");
  check(
    /Run ID.*valid UUID/.test(errorSchema.parse(badId.body).error),
    "Malformed run identifier has a friendly field label",
  );
  const missing = randomUUID();
  for (const [path, body] of [
    [`/api/runs/${missing}`, undefined],
    [`/api/runs/${missing}/export`, undefined],
    [
      `/api/runs/${missing}/review`,
      { decision: "confirmed", note: "Missing run regression" },
    ],
    [`/api/runs/${missing}/rerun`, {}],
    [`/api/campaigns/${missing}/stop`, {}],
  ] as const) {
    equal(
      (await request(path, { body })).status,
      404,
      `Missing authorized resource returns404 for ${path.split("/").at(-1)}`,
    );
  }
  const emptyExport = await request(`/api/runs/${records[0].runId}/export`);
  equal(
    emptyExport.status,
    409,
    "A metadata-only run cannot export invented call evidence",
  );
  check(
    /captured call evidence/.test(errorSchema.parse(emptyExport.body).error),
    "Empty export explains the required evidence",
  );
  const exhausted = await request(`/api/runs/${records[0].runId}/rerun`, {
    body: {},
  });
  equal(exhausted.status, 400, "Rerun refuses an exhausted campaign");
  check(
    /Maximum call count/.test(errorSchema.parse(exhausted.body).error),
    "Exhausted rerun states the scope limit",
  );
  await admin.query("UPDATE campaigns SET status='stopped' WHERE id=$1", [
    records[0].campaignId,
  ]);
  const stopped = await request(`/api/runs/${records[0].runId}/rerun`, {
    body: {},
  });
  equal(stopped.status, 400, "Rerun refuses a stopped campaign");
  check(
    /stopped/.test(errorSchema.parse(stopped.body).error),
    "Stopped rerun requires fresh authorization",
  );
  const targetBody = {
    name: "Regression target",
    transport: "pstn",
    phone: "+12025550199",
    authorized: true,
    authorizationReference: "ISOLATED REGRESSION ONLY",
  };
  const simulated = await request("/api/targets", {
    body: { ...targetBody, transport: "fixture" },
  });
  equal(
    simulated.status,
    400,
    "Target registration rejects removed simulation transport",
  );
  const blankTarget = await request("/api/targets", {
    body: { ...targetBody, name: "  " },
  });
  equal(blankTarget.status, 400, "Whitespace-only target names are rejected");
  check(
    /^Name must/.test(errorSchema.parse(blankTarget.body).error),
    "Blank target validation uses a friendly name label",
  );
  const blankCampaign = await request("/api/campaigns", {
    body: { name: "  ", targetId, scope: scope() },
  });
  equal(
    blankCampaign.status,
    400,
    "Whitespace-only campaign names are rejected before provider work",
  );
  check(
    /^Name must/.test(errorSchema.parse(blankCampaign.body).error),
    "Blank campaign validation uses a friendly name label",
  );
  for (const minutes of [0, 1441, 100000]) {
    const result = await request("/api/campaigns", {
      body: {
        name: "Window validation regression",
        targetId,
        scope: scope(minutes),
      },
    });
    equal(
      result.status,
      400,
      `Server rejects unsupported ${minutes}-minute campaign window`,
    );
    check(
      /window/i.test(errorSchema.parse(result.body).error),
      `Rejected ${minutes}-minute window explains its field`,
    );
  }
  const maximumWindow = await request("/api/campaigns", {
    body: { name: "Boundary window regression", targetId, scope: scope(1440) },
  });
  equal(
    maximumWindow.status,
    400,
    "Valid boundary window remains blocked by disabled live configuration",
  );
  check(
    /configuration is incomplete/i.test(
      errorSchema.parse(maximumWindow.body).error,
    ),
    "Exactly1440-minute window passes validation without contacting a provider",
  );
  equal(
    (await admin.query("SELECT count(*)::int AS count FROM campaigns")).rows[0]
      .count,
    72,
    "Rejected requests create no campaigns or outbound jobs",
  );
  await startApi("session");
  equal(
    (await request("/api/findings")).status,
    401,
    "Session mode rejects anonymous report access",
  );
  equal(
    (await request("/api/setup")).status,
    401,
    "Session mode protects setup diagnostics from anonymous access",
  );
  const login = await request("/api/auth/login", {
    body: { email: "report-owner@example.test", password },
  });
  equal(
    login.status,
    200,
    "Initial owner can authenticate against isolated database",
  );
  const authSchema = z.object({
    authenticated: z.boolean(),
    csrfToken: z.string(),
    workspace: z.object({ id: z.uuid() }),
  });
  let session = authSchema.parse(login.body);
  const cookies = login.response.headers.getSetCookie();
  const sessionCookie = cookies.find((value) =>
    value.startsWith("vouch_session="),
  );
  assert.ok(sessionCookie);
  const cookie = sessionCookie.split(";")[0];
  check(
    /httponly/i.test(sessionCookie) && /samesite=strict/i.test(sessionCookie),
    "Session cookie is HttpOnly and SameSite Strict",
  );
  equal(
    (await request("/api/findings", { cookie })).status,
    200,
    "Authenticated owner can read owned reports",
  );
  equal(
    (await request("/api/setup", { cookie })).status,
    200,
    "Authenticated owner can inspect actual workspace diagnostics",
  );
  equal(
    (
      await request(`/api/runs/${records[0].runId}/review`, {
        cookie,
        body: { decision: "confirmed", note: "Missing CSRF rejection" },
      })
    ).status,
    403,
    "Authenticated mutations reject missing CSRF protection",
  );
  const createdWorkspace = await request("/api/auth/workspaces", {
    cookie,
    csrf: session.csrfToken,
    body: { name: "Session isolation regression" },
  });
  equal(
    createdWorkspace.status,
    201,
    "Authenticated user can create an isolated workspace",
  );
  session = authSchema.parse(createdWorkspace.body);
  check(
    session.workspace.id !== workspaceId,
    "Creating a workspace changes the active workspace",
  );
  const isolatedPage = await request("/api/findings", { cookie });
  equal(
    findingsSchema.parse(isolatedPage.body).pagination.totalRuns,
    0,
    "New workspace cannot list previous workspace reports",
  );
  equal(
    (await request(`/api/runs/${records[0].runId}`, { cookie })).status,
    404,
    "Direct run identifier cannot cross the active workspace boundary",
  );
  equal(
    (await request(`/api/runs/${records[0].runId}/export`, { cookie })).status,
    404,
    "Regression export cannot cross the active workspace boundary",
  );
  equal(
    (
      await request(`/api/runs/${records[0].runId}/review`, {
        cookie,
        csrf: session.csrfToken,
        body: { decision: "confirmed", note: "Cross workspace rejection" },
      })
    ).status,
    404,
    "Review mutation cannot cross the active workspace boundary",
  );
  const switched = await request("/api/auth/workspace", {
    cookie,
    csrf: session.csrfToken,
    body: { workspaceId },
  });
  equal(
    switched.status,
    200,
    "Owner can switch back to an existing membership",
  );
  session = authSchema.parse(switched.body);
  equal(
    findingsSchema.parse((await request("/api/findings", { cookie })).body)
      .pagination.totalRuns,
    72,
    "Returning to owned workspace restores its report collection",
  );
  const loggedOut = await request("/api/auth/logout", {
    cookie,
    csrf: session.csrfToken,
    body: {},
  });
  equal(loggedOut.status, 200, "Authenticated session can log out");
  equal(
    (await request("/api/findings", { cookie })).status,
    401,
    "Logged-out session cannot reuse report access",
  );
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/report-api-regression.json",
    JSON.stringify(
      {
        status: "passed",
        assertions: checks.length,
        testRecords: records.length,
        providerCalls: 0,
        isolatedDatabase: true,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      status: "passed",
      assertions: checks.length,
      firstUseAssertions,
      testRecords: records.length,
      providerCalls: 0,
      report: "artifacts/report-api-regression.json",
    }),
  );
}
try {
  await main();
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
          .replaceAll(password, "[redacted]")
          .replaceAll(databaseUrl, "[redacted]")
      : "Isolated API regression failed",
  );
  console.error(`Completed assertions before failure ${checks.length}`);
  process.exitCode = 1;
} finally {
  await stopWorker();
  await stopApi();
  await endApplicationDatabase?.().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  if (
    containerCreated &&
    /^vouch-report-regression-[a-f0-9]{12}$/.test(containerName)
  )
    docker(["rm", "--force", containerName]);
  await rm(tempDirectory, { recursive: true, force: true });
  for (const name of Object.keys(process.env))
    if (!(name in savedEnvironment)) delete process.env[name];
  Object.assign(process.env, savedEnvironment);
}
