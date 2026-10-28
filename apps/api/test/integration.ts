import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import pg from "pg";
const connectionString =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString)
  throw new Error(
    "Configure TEST_DATABASE_URL or DATABASE_URL before running integration checks",
  );
const localUrl = new URL(connectionString);
if (!process.env.TEST_DATABASE_URL) localUrl.pathname += "_test";
const testUrl = localUrl.toString();
if (!new URL(testUrl).pathname.endsWith("_test"))
  throw new Error(
    "Integration tests require a dedicated database whose name ends in _test",
  );
process.env.DATABASE_URL = testUrl;
const adminUrl = new URL(testUrl);
const dbName = adminUrl.pathname.slice(1);
adminUrl.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
if (
  !(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [dbName]))
    .rowCount
) {
  if (!/^[a-z_]+$/.test(dbName)) throw new Error("Invalid test database name");
  await admin.query(`CREATE DATABASE ${dbName}`);
}
await admin.end();
const { db } = await import("../src/db");
const { migrate } = await import("../src/migrate");
const { tick } = await import("../src/worker");
await migrate();
await db.query(
  "TRUNCATE reviews,events,accounts,runs,campaigns,targets CASCADE",
);
const port = 4061;
const child = spawn(
  process.execPath,
  ["--import", "tsx", "apps/api/src/server.ts"],
  {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      VOUCH_INGEST_TOKEN: "integration-only-not-a-live-credential",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
child.stdout.on("data", (d) => {
  logs += d;
});
child.stderr.on("data", (d) => {
  logs += d;
});
let checks = 0;
async function call(
  path: string,
  body?: unknown,
  expected = 200,
  headers: Record<string, string> = {},
) {
  const r = await fetch(
    `http://127.0.0.1:${port}/api${path}`,
    body === undefined
      ? { headers }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  assert.equal(r.status, expected, `${path}: ${JSON.stringify(data)}`);
  checks++;
  return data;
}
const scope = () => ({
  startsAt: new Date(Date.now() - 1000).toISOString(),
  endsAt: new Date(Date.now() + 3600000).toISOString(),
  concurrency: 1,
  maxCalls: 4,
  maxDurationSeconds: 60,
  budgetCents: 0,
  syntheticIdentity: "Alex Morgan / SYN-1042",
  categories: ["false_authority", "benign_control"],
  prohibitedActions: [
    "real_personal_data",
    "real_payments",
    "external_targets",
  ],
  stopOnFinding: false,
});
async function checkPublicBoundary() {
  const privateFiles = [
    "internal-notes.txt",
    "assets/internal-notes.txt",
    "assets/internal-source.js.map",
  ];
  await mkdir("dist/web/assets", { recursive: true });
  for (const file of privateFiles)
    await writeFile(`dist/web/${file}`, "PRIVATE TEST CANARY");
  try {
    for (const path of [
      "/docs/product-brief.md",
      "/docs/action-log.md",
      "/artifacts/audit/crap-report.txt",
      "/.git/config",
      "/%2eenv",
      "/package.json",
      "/apps/api/src/server.ts",
      ...privateFiles.map((file) => `/${file}`),
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 404, `${path} must not be a public route`);
      assert.ok(!(await response.text()).includes("PRIVATE TEST CANARY"));
      checks += 2;
    }
  } finally {
    for (const file of privateFiles)
      await rm(`dist/web/${file}`, { force: true });
  }
  for (const path of [
    "/",
    "/credits",
    "/app",
    "/app/findings",
    "/licenses/phosphor-MIT.txt",
    "/brand/vouch-mark.webp",
    "/favicon.ico",
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200, `${path} must remain accessible`);
    checks++;
  }
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  const script = html.match(/src="(\/assets\/[^\"]+\.js)"/);
  assert.ok(script, "The built page must reference its compiled script");
  assert.equal(
    (await fetch(`http://127.0.0.1:${port}${script[1]}`)).status,
    200,
  );
  assert.equal(
    (await fetch(`http://127.0.0.1:${port}/assets/missing.js`)).status,
    404,
  );
  assert.equal((await fetch(`http://127.0.0.1:${port}/%ZZ`)).status, 400);
  checks += 4;
}
try {
  let ready = false;
  for (let n = 0; n < 40; n++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, logs);
  await checkPublicBoundary();
  const hidden = await fetch(`http://127.0.0.1:${port}/.env`);
  assert.equal(
    hidden.status,
    404,
    "Dotfiles must be rejected before the SPA fallback",
  );
  checks++;
  const malformed = await fetch(`http://127.0.0.1:${port}/api/targets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid secret body",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, "Malformed JSON body");
  checks += 2;
  const oversized = await fetch(`http://127.0.0.1:${port}/api/targets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(600000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal(
    (await oversized.json()).error,
    "Request body exceeds the supported limit",
  );
  checks += 2;
  await call(
    "/targets",
    {
      name: "Bad target",
      transport: "fixture",
      authorized: false,
      authorizationReference: "Not authorized",
    },
    400,
  );
  await call(
    "/targets",
    {
      name: "External",
      transport: "pstn",
      phone: "+12025550199",
      authorized: true,
      authorizationReference: "Test operator approval",
    },
    403,
  );
  await call(
    "/targets",
    {
      name: "Cross origin",
      transport: "fixture",
      authorized: true,
      authorizationReference: "Test only",
    },
    403,
    { Origin: "https://untrusted.example" },
  );
  const t = await call(
    "/targets",
    {
      name: "Integration support",
      transport: "fixture",
      authorized: true,
      authorizationReference: "Dedicated synthetic integration test target",
    },
    201,
  );
  await call(
    "/campaigns",
    { name: "Invalid", targetId: t.id, scope: { ...scope(), concurrency: 5 } },
    400,
  );
  await call(
    "/campaigns",
    { name: "Invalid", targetId: t.id, scope: { ...scope(), maxCalls: 1 } },
    400,
  );
  await call(
    "/campaigns",
    { name: "Invalid", targetId: t.id, scope: { ...scope(), budgetCents: -1 } },
    400,
  );
  await call(
    "/campaigns",
    {
      name: "Invalid",
      targetId: t.id,
      scope: { ...scope(), bypassLimits: true },
    },
    400,
  );
  const c = await call(
    "/campaigns",
    { name: "Integration baseline", targetId: t.id, scope: scope() },
    201,
  );
  assert.equal(await tick(), true);
  assert.equal(await tick(), true);
  let overview = await call("/overview");
  const runs = overview.runs.filter((r: any) => r.campaign_id === c.id);
  assert.equal(runs.length, 2);
  assert.ok(runs.every((r: any) => r.status === "completed"));
  assert.ok(
    overview.runs.every((r: any) => !Object.hasOwn(r, "config")),
    "Polling summaries must not repeat captured configuration",
  );
  assert.ok(
    overview.campaigns.every((r: any) => !Object.hasOwn(r, "config")),
    "Campaign summaries must not repeat captured configuration",
  );
  checks += 2;
  const attack = runs.find((r: any) => r.scenario === "false_authority"),
    benign = runs.find((r: any) => r.scenario === "benign_control");
  assert.equal(attack.verdict.outcome, "violation");
  assert.equal(benign.verdict.outcome, "pass");
  assert.equal(attack.verdict.stateChanged, true);
  checks += 4;
  const detail = await call(`/runs/${attack.id}`);
  assert.equal(detail.events.length, 10);
  assert.equal(detail.recording.available, false);
  assert.ok(detail.events.some((e: any) => e.kind === "backend.state"));
  assert.equal(
    detail.events.some((e: any) => e.kind === "identity.verified"),
    false,
  );
  checks += 4;
  await call(
    `/runs/${attack.id}/review`,
    {
      decision: "confirmed",
      note: "Backend changed phone without verification",
    },
    200,
  );
  await call(
    `/runs/${attack.id}/review`,
    { decision: "dismissed", note: "Correction retained in audit history" },
    200,
  );
  const reviewed = await call(`/runs/${attack.id}`);
  assert.equal(reviewed.reviews.length, 2);
  assert.equal(reviewed.verdict.outcome, "violation");
  checks += 2;
  await call(
    `/runs/${benign.id}/review`,
    { decision: "confirmed", note: "Not a finding" },
    400,
  );
  const exported = await call(`/runs/${attack.id}/export`);
  assert.equal(exported.version, 1);
  assert.equal(exported.configHash, c.configHash);
  assert.equal(exported.review.history.length, 2);
  assert.equal(exported.synthetic, true);
  assert.equal(exported.configIntegrity, "verified");
  assert.equal(exported.configHashAlgorithm, "sha256-sorted-json-v1");
  assert.equal(detail.config_integrity, "verified");
  checks += 3;
  checks += 4;
  const canonical = JSON.stringify(exported.config, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : value,
  );
  assert.equal(
    exported.configHash,
    createHash("sha256").update(canonical).digest("hex"),
    "An exported configuration digest must be reproducible after PostgreSQL JSONB storage",
  );
  checks++;
  for (let i = 0; i < 2; i++) {
    const r = await call(`/runs/${attack.id}/rerun`, {}, 201);
    await tick();
    const result = await call(`/runs/${r.id}`);
    assert.equal(result.config_hash, c.configHash);
    assert.equal(result.verdict.outcome, "violation");
    checks += 2;
  }
  await call(`/runs/${attack.id}/rerun`, {}, 400);
  await call(
    `/runs/${attack.id}/evidence`,
    { kind: "identity.verified", at: 0, source: "backend", data: {} },
    401,
  );
  await call(
    `/runs/${attack.id}/evidence`,
    { kind: "identity.verified", at: 0, source: "backend", data: {} },
    400,
    { Authorization: "Bearer integration-only-not-a-live-credential" },
  );
  const stopped = await call(
    "/campaigns",
    { name: "Stop condition test", targetId: t.id, scope: scope() },
    201,
  );
  await call(`/campaigns/${stopped.id}/stop`, {});
  await tick();
  overview = await call("/overview");
  assert.ok(
    overview.runs
      .filter((r: any) => r.campaign_id === stopped.id)
      .every((r: any) => r.status === "cancelled"),
  );
  checks++;
  const expired = await call(
    "/campaigns",
    { name: "Expired before execution", targetId: t.id, scope: scope() },
    201,
  );
  await db.query(
    "UPDATE campaigns SET scope=jsonb_set(scope,'{endsAt}',to_jsonb('2000-01-01T00:00:00.000Z'::text)) WHERE id=$1",
    [expired.id],
  );
  await tick();
  await tick();
  overview = await call("/overview");
  assert.ok(
    overview.runs
      .filter((r: any) => r.campaign_id === expired.id)
      .every((r: any) => r.status === "failed"),
  );
  checks++;
  const future = await call(
    "/campaigns",
    {
      name: "Scheduled future campaign",
      targetId: t.id,
      scope: {
        ...scope(),
        startsAt: new Date(Date.now() + 600000).toISOString(),
      },
    },
    201,
  );
  assert.equal(await tick(), false);
  overview = await call("/overview");
  assert.ok(
    overview.runs
      .filter((r: any) => r.campaign_id === future.id)
      .every((r: any) => r.status === "queued"),
  );
  checks += 2;
  const condition = await call(
    "/campaigns",
    {
      name: "Stop on finding",
      targetId: t.id,
      scope: { ...scope(), stopOnFinding: true },
    },
    201,
  );
  await tick();
  await tick();
  overview = await call("/overview");
  assert.equal(
    overview.campaigns.find((x: any) => x.id === condition.id).status,
    "stopped",
  );
  const stoppedRun = overview.runs.find(
    (r: any) =>
      r.campaign_id === condition.id && r.scenario === "false_authority",
  );
  await call(`/runs/${stoppedRun.id}/rerun`, {}, 400);
  checks++;
  const concurrent = await call(
    "/campaigns",
    { name: "Multiple workers", targetId: t.id, scope: scope() },
    201,
  );
  await Promise.all(Array.from({ length: 6 }, () => tick()));
  while (await tick()) {}
  overview = await call("/overview");
  const concurrentRuns = overview.runs.filter(
    (r: any) => r.campaign_id === concurrent.id,
  );
  assert.equal(concurrentRuns.length, 2);
  assert.ok(concurrentRuns.every((r: any) => r.status === "completed"));
  checks += 2;
  await call(`/runs/${attack.id}/export/missing`, undefined, 404);
  const stale = await call(
    "/campaigns",
    { name: "Stale job recovery", targetId: t.id, scope: scope() },
    201,
  );
  const queued = (
    await db.query(
      "SELECT * FROM runs WHERE campaign_id=$1 ORDER BY scenario",
      [stale.id],
    )
  ).rows;
  await db.query("INSERT INTO accounts(run_id,phone) VALUES($1,$2)", [
    queued[0].id,
    "+1 202-555-0104",
  ]);
  assert.equal(
    await tick(),
    true,
    "A SQL failure must mark the job failed without aborting the queue transaction",
  );
  await tick();
  const staleOverview = await call("/overview");
  assert.equal(
    staleOverview.runs.find((r: any) => r.id === queued[0].id).status,
    "failed",
  );
  assert.equal(
    staleOverview.campaigns.find((c: any) => c.id === stale.id).status,
    "failed",
    "A later successful case must not erase a failed campaign outcome",
  );
  checks += 3;
  await db.query(
    "UPDATE runs SET config=jsonb_set(config,'{policy,precondition}',to_jsonb('legacy.identity_verified'::text)) WHERE id=$1",
    [queued[1].id],
  );
  const archived = await call(`/runs/${queued[1].id}/export`);
  assert.equal(
    archived.expected.requires,
    "legacy.identity_verified",
    "Regression exports must use the captured policy, never the current global policy",
  );
  checks++;
  for (const kind of [
    "unknown_category",
    "incompatible_runtime",
    "missing_scenario",
    "changed_prompt",
    "changed_scope",
    "changed_digest",
    "unknown_digest_algorithm",
  ]) {
    const configCase = await call(
      "/campaigns",
      { name: `Configuration guard ${kind}`, targetId: t.id, scope: scope() },
      201,
    );
    const jobs = (
      await db.query(
        "SELECT id,scenario,config FROM runs WHERE campaign_id=$1 ORDER BY scenario",
        [configCase.id],
      )
    ).rows;
    if (
      [
        "unknown_category",
        "incompatible_runtime",
        "missing_scenario",
        "changed_prompt",
      ].includes(kind)
    )
      await db.query(
        "UPDATE campaigns SET config_hash_algorithm='sha256-json-stringify-v1' WHERE id=$1",
        [configCase.id],
      );
    if (kind === "unknown_category")
      await db.query("UPDATE runs SET scenario=$2 WHERE id=$1", [
        jobs[0].id,
        "unsupported",
      ]);
    if (kind === "incompatible_runtime")
      await db.query(
        "UPDATE runs SET config=jsonb_set(config,'{runtime,model}',to_jsonb('unverified-model'::text)) WHERE campaign_id=$1",
        [configCase.id],
      );
    if (kind === "missing_scenario")
      await db.query(
        "UPDATE runs SET config=jsonb_set(config,'{scenarios}','{}'::jsonb) WHERE campaign_id=$1",
        [configCase.id],
      );
    if (kind === "changed_prompt")
      await db.query(
        "UPDATE runs SET config=jsonb_set(config,'{scenarios,false_authority,prompt}',to_jsonb('Changed without new version'::text)) WHERE campaign_id=$1",
        [configCase.id],
      );
    if (kind === "changed_scope")
      await db.query(
        "UPDATE campaigns SET scope=jsonb_set(scope,'{budgetCents}','1'::jsonb) WHERE id=$1",
        [configCase.id],
      );
    if (kind === "changed_digest")
      await db.query("UPDATE campaigns SET config_hash=$2 WHERE id=$1", [
        configCase.id,
        "0".repeat(64),
      ]);
    if (kind === "unknown_digest_algorithm")
      await db.query(
        "UPDATE campaigns SET config_hash_algorithm='unsupported' WHERE id=$1",
        [configCase.id],
      );
    await tick();
    await tick();
    const guard = await call("/overview");
    const failed = guard.runs.filter(
      (r: any) => r.campaign_id === configCase.id && r.status === "failed",
    );
    assert.ok(failed.length > 0, `${kind} must not execute silently`);
    assert.equal(
      guard.campaigns.find((c: any) => c.id === configCase.id).status,
      "failed",
    );
    checks += 2;
  }
  // Exercise the authenticated connector boundary without claiming a real call.
  const malformedSchedule = await call(
    "/campaigns",
    {
      name: "Malformed schedule must not poison the queue",
      targetId: t.id,
      scope: scope(),
    },
    201,
  );
  await db.query(
    "UPDATE campaigns SET scope=jsonb_set(scope,'{startsAt}',to_jsonb('not-a-date'::text)) WHERE id=$1",
    [malformedSchedule.id],
  );
  await assert.doesNotReject(
    () => tick(),
    "One malformed stored schedule must not abort all queue selection",
  );
  await tick();
  const healthyAfter = await call(
    "/campaigns",
    {
      name: "Healthy campaign after malformed schedule",
      targetId: t.id,
      scope: scope(),
    },
    201,
  );
  await tick();
  await tick();
  const recoveredQueue = await call("/overview");
  assert.equal(
    recoveredQueue.campaigns.find((c: any) => c.id === malformedSchedule.id)
      .status,
    "failed",
  );
  assert.equal(
    recoveredQueue.campaigns.find((c: any) => c.id === healthyAfter.id).status,
    "completed",
  );
  checks += 3;
  const telemetry = await call(
    "/campaigns",
    { name: "Connector telemetry contract", targetId: t.id, scope: scope() },
    201,
  );
  const telemetryJob = (
    await db.query(
      "SELECT id FROM runs WHERE campaign_id=$1 ORDER BY scenario",
      [telemetry.id],
    )
  ).rows[0];
  await db.query(
    "UPDATE runs SET synthetic=false,status='running' WHERE id=$1",
    [telemetryJob.id],
  );
  const auth = {
    Authorization: "Bearer integration-only-not-a-live-credential",
  };
  await call(
    `/runs/${telemetryJob.id}/evidence`,
    {
      kind: "tool.requested",
      source: "backend",
      at: 1000,
      data: { tool: "change_contact_phone", accountId: "SYN-1042" },
    },
    201,
    auth,
  );
  await call(
    `/runs/${telemetryJob.id}/evidence`,
    {
      kind: "tool.executed",
      source: "backend",
      at: 2000,
      data: {
        tool: "change_contact_phone",
        accountId: "SYN-1042",
        success: true,
      },
    },
    201,
    auth,
  );
  await call(
    `/runs/${telemetryJob.id}/evidence`,
    {
      kind: "backend.state",
      source: "backend",
      at: 3000,
      data: { accountId: "SYN-1042", before: "0104", after: "0199" },
    },
    201,
    auth,
  );
  await call(
    `/runs/${telemetryJob.id}/evidence`,
    {
      kind: "provider.event",
      source: "backend",
      at: 4000,
      data: { verificationLogComplete: true },
    },
    201,
    auth,
  );
  const ingested = await call(`/runs/${telemetryJob.id}`);
  assert.equal(ingested.verdict.outcome, "violation");
  assert.equal(ingested.events.length, 4);
  checks += 2;
  await call(
    `/runs/${telemetryJob.id}/evidence`,
    { kind: "provider.event", source: "backend", at: 0.5, data: {} },
    400,
    auth,
  );
  await db.query(
    "UPDATE runs SET config=jsonb_set(config,'{policy,precondition}',to_jsonb('legacy.identity_verified'::text)) WHERE id=$1",
    [telemetryJob.id],
  );
  const incompatiblePolicy = await call(
    `/runs/${telemetryJob.id}/evidence`,
    { kind: "provider.event", source: "backend", at: 5000, data: {} },
    400,
    auth,
  );
  assert.match(incompatiblePolicy.error, /precondition/);
  const rejectedEvidence = await call(`/runs/${telemetryJob.id}`);
  assert.equal(
    rejectedEvidence.events.length,
    4,
    "Rejected evidence must not append events or reinterpret a historical policy",
  );
  assert.equal(rejectedEvidence.config_integrity, "mismatch");
  checks += 3;
  console.log(
    `Integration passed: ${checks} HTTP and evidence assertions, real PostgreSQL, isolated test database.`,
  );
} finally {
  child.kill("SIGTERM");
  await new Promise<void>((r) => child.once("exit", () => r()));
  await db.end();
}
