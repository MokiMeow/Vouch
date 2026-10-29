import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  capturedPolicySchema,
  assertScope,
  policy,
  scopeSchema,
  targetSchema,
  type EvidenceEvent,
} from "../../../packages/core/src/index";
import { BolnaRuntime } from "./providers/bolna/runtime";
import { db, transaction, withSystemDatabase } from "./database/client";
import {
  CONFIG_HASH_ALGORITHM,
  assertConfigurationHash,
  canonicalJson,
  configurationHash,
  configurationIntegrity,
} from "./campaigns/configuration";
import { listFindings, pageQuerySchema } from "./findings/list";
import { validationMessage } from "./http/validation";
import { evidenceAvailability } from "./evidence/availability";
import { publicSite } from "./http/public-site";
import {
  authRouter,
  bootstrapAuth,
  requireWorkspace,
  requireOwner,
} from "./auth/service";
import { installHttpSecurity, listenHost } from "./http/security";
import {
  captureLiveConfiguration,
  liveReadiness,
  requestLiveCancellation,
  reconcileLiveExecution,
  validateLiveReconciliation,
} from "./execution/live";
import { evidenceRouter, signedEvidenceRouter } from "./evidence/ingestion";
import { listRunArtifacts } from "./evidence/artifacts";
import type { LiveTarget } from "./execution/live";
const app = express();
installHttpSecurity(app);
app.use(express.json({ limit: "512kb" }));
const uuid = z.uuid();
const routeId = (id: unknown) => z.object({ id: uuid }).parse({ id }).id;
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/api/health", async (_req, res) => {
  try {
    await withSystemDatabase(() => db.query("SELECT 1"));
    res.json({ status: "ok", database: "postgresql" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
app.get("/api/ready", async (_req, res) => {
  try {
    await withSystemDatabase(() => db.query("SELECT 1 FROM campaigns LIMIT 0"));
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
app.use("/api", signedEvidenceRouter);
app.use("/api/auth", authRouter);
app.use("/api", requireWorkspace);
app.use("/api", evidenceRouter);
app.get("/api/overview", async (req, res) => {
  const { limit, offset } = pageQuerySchema.parse(req.query);
  const [targets, campaigns, runs, counts] = await Promise.all([
    db.query(
      "SELECT id,name,transport,phone,authorization_reference,created_at FROM targets WHERE transport='pstn' ORDER BY created_at DESC",
    ),
    db.query(
      "SELECT c.id,c.name,c.target_id,c.mode,c.scope,c.status,c.calls_used,c.created_at,t.name AS target_name FROM campaigns c JOIN targets t ON t.id=c.target_id WHERE c.mode='live' ORDER BY c.created_at DESC,c.id DESC LIMIT $1 OFFSET $2",
      [limit, offset],
    ),
    db.query(
      "SELECT r.id,r.campaign_id,r.scenario,r.status,r.synthetic,r.verdict,r.review,r.created_at,c.name AS campaign_name,t.name AS target_name FROM runs r JOIN campaigns c ON c.id=r.campaign_id JOIN targets t ON t.id=c.target_id WHERE NOT r.synthetic AND c.id IN (SELECT id FROM campaigns WHERE mode='live' ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2) ORDER BY r.created_at DESC",
      [limit, offset],
    ),
    db.query(`SELECT (SELECT count(*) FROM campaigns WHERE mode='live')::int AS campaigns, count(*) FILTER (WHERE status='completed')::int AS runs, count(*)::int AS "totalRuns", count(*) FILTER (WHERE status IN ('queued','running','awaiting_evidence'))::int AS "activeRuns",
      count(*) FILTER (WHERE verdict->>'outcome'='violation')::int AS candidates,
      count(*) FILTER (WHERE verdict->>'tier'='backend_verified')::int AS "backendVerified",
      count(*) FILTER (WHERE verdict->>'outcome'='violation' AND review='pending')::int AS "pendingFindings" FROM runs WHERE NOT synthetic`),
  ]);
  const summary = counts.rows[0];
  res.json({
    targets: targets.rows,
    campaigns: campaigns.rows,
    runs: runs.rows,
    policy,
    summary,
    pagination: {
      limit,
      offset,
      totalCampaigns: summary.campaigns,
      hasMore: offset + campaigns.rows.length < summary.campaigns,
    },
    live: liveReadiness(),
  });
});
app.get("/api/findings", async (req, res) =>
  res.json(await listFindings(req.query)),
);
app.post("/api/targets", async (req, res) => {
  const t = targetSchema.parse(req.body);
  if (t.transport !== "pstn")
    return res.status(400).json({
      error:
        "Register an authorized phone target to capture real call evidence",
    });
  if (t.transport === "pstn") {
    if (!t.phone) throw new Error("PSTN targets require an E.164 phone number");
    const allowed = (process.env.AUTHORIZED_PHONE_NUMBERS ?? "")
      .split(",")
      .map((s) => s.trim());
    if (!allowed.includes(t.phone))
      return res.status(403).json({
        error:
          "Target phone is not in the operator-managed AUTHORIZED_PHONE_NUMBERS allowlist",
      });
  }
  const id = randomUUID();
  await db.query(
    "INSERT INTO targets(id,name,transport,phone,authorization_reference) VALUES($1,$2,$3,$4,$5)",
    [id, t.name, t.transport, t.phone ?? null, t.authorizationReference],
  );
  res.status(201).json({ id });
});
const campaignSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    targetId: z.uuid(),
    scope: scopeSchema,
    mode: z.literal("live").optional(),
  })
  .strict();
app.post("/api/campaigns", async (req, res) => {
  const input = campaignSchema.parse(req.body);
  const target = (
    await db.query<LiveTarget>("SELECT * FROM targets WHERE id=$1", [
      input.targetId,
    ])
  ).rows[0];
  if (!target) return res.status(404).json({ error: "Target not found" });
  const mode = "live";
  if (target.transport !== "pstn")
    return res.status(400).json({ error: "Select an authorized phone target" });
  if (Date.parse(input.scope.endsAt) <= Date.now())
    throw new Error("The test window has already expired");
  const config = await captureLiveConfiguration(target, input.scope);
  const output = await transaction(async (c) => {
    const t = (
      await c.query("SELECT * FROM targets WHERE id=$1 FOR SHARE", [
        input.targetId,
      ])
    ).rows[0];
    if (
      !t ||
      t.transport !== target.transport ||
      t.phone !== target.phone ||
      t.authorization_reference !== target.authorization_reference
    )
      throw new Error(
        "The authorized target changed while preparing the campaign",
      );
    const id = randomUUID();
    const configHash = configurationHash(config);
    await c.query(
      "INSERT INTO campaigns(id,name,target_id,mode,scope,config,config_hash,config_hash_algorithm,calls_used) VALUES($1,$2,$3,$4,$5,$6,$7,$8,2)",
      [
        id,
        input.name,
        t.id,
        mode,
        input.scope,
        config,
        configHash,
        CONFIG_HASH_ALGORITHM,
      ],
    );
    for (const scenario of ["benign_control", "false_authority"])
      await c.query(
        "INSERT INTO runs(id,campaign_id,scenario,config,synthetic) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), id, scenario, config, false],
      );
    return { id, configHash, configHashAlgorithm: CONFIG_HASH_ALGORITHM };
  });
  res.status(201).json(output);
});
app.post("/api/campaigns/:id/stop", async (req, res) => {
  await transaction(async (c) => {
    const result = await c.query(
      "UPDATE campaigns SET status='stopped' WHERE id=$1 RETURNING id",
      [routeId(req.params.id)],
    );
    if (!result.rows.length)
      throw Object.assign(new Error("Campaign not found"), { status: 404 });
    await requestLiveCancellation(c, req.params.id as string);
    await c.query(
      "UPDATE runs SET status='cancelled',finished_at=now() WHERE campaign_id=$1 AND status='queued'",
      [req.params.id],
    );
  });
  res.json({ status: "stopped" });
});
app.get("/api/runs/:id", async (req, res) => {
  const id = routeId(req.params.id);
  const r = (
    await db.query(
      "SELECT r.*,c.name AS campaign_name,c.status AS campaign_status,c.calls_used,c.scope,c.config_hash,c.config_hash_algorithm,t.name AS target_name FROM runs r JOIN campaigns c ON c.id=r.campaign_id JOIN targets t ON t.id=c.target_id WHERE r.id=$1 AND NOT r.synthetic",
      [id],
    )
  ).rows[0];
  if (!r) return res.status(404).json({ error: "Run not found" });
  const events = (
    await db.query<EvidenceEvent>(
      "SELECT * FROM events WHERE run_id=$1 ORDER BY seq",
      [id],
    )
  ).rows;
  const reviews = (
    await db.query(
      "SELECT * FROM reviews WHERE run_id=$1 ORDER BY created_at",
      [id],
    )
  ).rows;
  const [artifacts, liveExecution, privacy] = await Promise.all([
    listRunArtifacts(id),
    db.query(
      "SELECT state,provider_execution_id,reserved_cents,settled_cents,deadline_at,last_error,terminal_at,cancel_requested,cleanup_state,cleanup_error,caller_deleted_at FROM live_executions WHERE run_id=$1",
      [id],
    ),
    db.query(
      "SELECT recording_redacted,transcript_redacted FROM provider_evidence_cursors WHERE run_id=$1",
      [id],
    ),
  ]);
  res.json({
    ...r,
    remainingSlots: Math.max(0, r.scope.maxCalls - r.calls_used),
    ...evidenceAvailability(events, { synthetic: r.synthetic }),
    artifacts,
    liveExecution: liveExecution.rows[0] ?? null,
    config_integrity: configurationIntegrity(
      r.config,
      r.config_hash,
      r.config_hash_algorithm,
    ),
    events,
    reviews,
    recording: {
      available: artifacts.length > 0,
      redacted: privacy.rows[0]?.recording_redacted ?? false,
      transcriptRedacted: privacy.rows[0]?.transcript_redacted ?? false,
      reason: privacy.rows[0]?.recording_redacted
        ? "Recording discarded by the workspace owner"
        : artifacts.length
          ? "Actual provider recording archived securely"
          : "Recording not ingested",
    },
  });
});
app.post("/api/runs/:id/review", async (req, res) => {
  const body = z
    .object({
      decision: z.enum(["confirmed", "dismissed"]),
      note: z.string().trim().min(3).max(2000),
    })
    .strict()
    .parse(req.body);
  const id = routeId(req.params.id);
  await transaction(async (c) => {
    const r = (
      await c.query(
        "SELECT * FROM runs WHERE id=$1 AND NOT synthetic FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!r) throw Object.assign(new Error("Run not found"), { status: 404 });
    if (
      !["completed", "failed", "cancelled"].includes(r.status) ||
      r.verdict?.outcome !== "violation"
    )
      throw new Error("Only a finished candidate finding can be reviewed");
    await c.query(
      "INSERT INTO reviews(id,run_id,decision,note) VALUES($1,$2,$3,$4)",
      [randomUUID(), id, body.decision, body.note],
    );
    await c.query("UPDATE runs SET review=$2,review_note=$3 WHERE id=$1", [
      id,
      body.decision,
      body.note,
    ]);
  });
  res.json({ status: body.decision });
});
app.post("/api/runs/:id/rerun", async (req, res) => {
  const output = await transaction(async (c) => {
    const original = (
      await c.query(
        "SELECT r.*,c.scope,c.status AS campaign_status,c.calls_used,c.config_hash,c.config_hash_algorithm FROM runs r JOIN campaigns c ON c.id=r.campaign_id WHERE r.id=$1 FOR UPDATE OF c",
        [routeId(req.params.id)],
      )
    ).rows[0];
    if (!original)
      throw Object.assign(new Error("Run not found"), { status: 404 });
    if (original.synthetic)
      throw new Error("Archived simulated runs cannot be rerun");
    if (original.campaign_status === "stopped")
      throw new Error(
        "Campaign was stopped. Register a new authorized campaign to continue.",
      );
    if (!["completed", "failed", "cancelled"].includes(original.status))
      throw new Error("Wait for the original run to finish");
    const s = scopeSchema.parse(original.scope);
    assertConfigurationHash(
      original.config,
      original.config_hash,
      original.config_hash_algorithm,
    );
    if (canonicalJson(original.config.scope) !== canonicalJson(s))
      throw new Error("The captured scope no longer matches this campaign");
    assertScope(s, Date.now(), original.calls_used);
    const id = randomUUID();
    await c.query(
      "INSERT INTO runs(id,campaign_id,scenario,synthetic,config) VALUES($1,$2,$3,$4,$5)",
      [
        id,
        original.campaign_id,
        original.scenario,
        original.synthetic,
        original.config,
      ],
    );
    await c.query(
      "UPDATE campaigns SET calls_used=calls_used+1,status='queued' WHERE id=$1",
      [original.campaign_id],
    );
    return { id };
  });
  res.status(201).json(output);
});
app.get("/api/runs/:id/export", async (req, res) => {
  const id = routeId(req.params.id);
  const r = (
    await db.query(
      "SELECT r.*,c.config_hash,c.config_hash_algorithm FROM runs r JOIN campaigns c ON c.id=r.campaign_id WHERE r.id=$1 AND NOT r.synthetic",
      [id],
    )
  ).rows[0];
  if (!r) return res.status(404).json({ error: "Run not found" });
  const events = (
    await db.query<EvidenceEvent>(
      "SELECT * FROM events WHERE run_id=$1 ORDER BY seq",
      [id],
    )
  ).rows;
  const reviews = (
    await db.query(
      "SELECT decision,note,created_at FROM reviews WHERE run_id=$1 ORDER BY created_at",
      [id],
    )
  ).rows;
  if (!evidenceAvailability(events, { synthetic: r.synthetic }).exportReady)
    return res.status(409).json({
      error: "Export is available after the run has captured call evidence",
    });
  const artifacts = await listRunArtifacts(id);
  const capturedPolicy = capturedPolicySchema.parse(r.config.policy);
  res.attachment(`vouch-${id.slice(0, 8)}-regression.v1.json`).json({
    schema: "vouch.regression",
    version: 1,
    exportedAt: new Date().toISOString(),
    synthetic: r.synthetic,
    scenario: r.scenario,
    configHash: r.config_hash,
    configHashAlgorithm: r.config_hash_algorithm,
    configIntegrity: configurationIntegrity(
      r.config,
      r.config_hash,
      r.config_hash_algorithm,
    ),
    config: r.config,
    expected: {
      tool: capturedPolicy.tool,
      requires: capturedPolicy.precondition,
      forbiddenOutcome: capturedPolicy.forbiddenOutcome,
    },
    observed: r.verdict,
    review: { status: r.review, history: reviews },
    evidence: events,
    recording: {
      available: artifacts.length > 0,
      artifacts,
    },
    note: "Replays preserve configuration; outcomes are reevaluated from newly ingested evidence.",
  });
});
// Legacy shared-token ingestion is retired in favor of per-run signed connectors.
app.post("/api/runs/:id/evidence", (_req, res) => {
  res
    .status(410)
    .json({ error: "Use the signed per-run backend-events connector" });
});
app.post("/api/runs/:id/reconcile", requireOwner, async (req, res) => {
  const { providerExecutionId } = z
    .object({ providerExecutionId: z.string().trim().min(1).max(200) })
    .strict()
    .parse(req.body);
  const runId = routeId(req.params.id);
  if (!(await db.query("SELECT id FROM runs WHERE id=$1", [runId])).rows.length)
    return res.status(404).json({ error: "Run not found" });
  await validateLiveReconciliation(runId, providerExecutionId);
  await transaction((c) =>
    reconcileLiveExecution(c, runId, providerExecutionId),
  );
  res.status(202).json({ status: "reconciliation_requested" });
});
app.post("/api/integrations/bolna/check", requireOwner, async (_req, res) => {
  const result = await new BolnaRuntime().checkConnection();
  res.json({
    connection: "reachable",
    ...result,
    liveDispatchEnabled: liveReadiness().enabled,
    note: "Read-only connectivity check. No outbound call was made.",
  });
});
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});
app.use(publicSite);
type ErrorResponse = { status: number; message: string };
function bodyParserFailure(error: unknown): ErrorResponse | null {
  if (!error || typeof error !== "object" || !("type" in error)) return null;
  const failures: Record<string, ErrorResponse> = {
    "entity.parse.failed": { status: 400, message: "Malformed JSON body" },
    "entity.too.large": {
      status: 413,
      message: "Request body exceeds the supported limit",
    },
  };
  return failures[String(error.type)] ?? null;
}
function isDatabaseError(error: unknown) {
  return !!(error && typeof error === "object" && "code" in error);
}
function applicationFailure(error: unknown): ErrorResponse {
  if (error instanceof z.ZodError)
    return {
      status: 400,
      message: validationMessage(error),
    };
  if (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    [400, 401, 403, 404, 409, 410, 413, 429, 500, 503].includes(error.status)
  )
    return { status: error.status, message: error.message };
  if (isDatabaseError(error))
    return { status: 500, message: "Database operation failed" };
  return {
    status: 400,
    message: error instanceof Error ? error.message : "Unexpected server error",
  };
}
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const failure = bodyParserFailure(error) ?? applicationFailure(error);
    console.error(
      JSON.stringify({
        event: "request_failed",
        requestId: res.locals.requestId,
        status: failure.status,
        category:
          error instanceof z.ZodError
            ? "validation"
            : isDatabaseError(error)
              ? "database"
              : "application",
      }),
    );
    res
      .status(failure.status)
      .json({ error: failure.message, requestId: res.locals.requestId });
  },
);
await bootstrapAuth();
const host = listenHost();
const server = app.listen(Number(process.env.PORT ?? 4000), host, () =>
  console.log(
    JSON.stringify({
      event: "api_started",
      host,
      port: Number(process.env.PORT ?? 4000),
    }),
  ),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => server.closeAllConnections(), 10000);
  deadline.unref();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  clearTimeout(deadline);
  await db.end();
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
