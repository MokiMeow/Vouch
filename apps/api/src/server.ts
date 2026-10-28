import "dotenv/config";
import express from "express";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  capturedPolicySchema,
  evaluate,
  eventSchema,
  policy,
  scenarios,
  scopeSchema,
  targetSchema,
  type Scope,
} from "../../../packages/core/src/index";
import { BolnaRuntime } from "./bolna";
import { db, transaction } from "./db";
import { appendEvent } from "./fixture";
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));
app.use((req, res, next) => {
  if (!["127.0.0.1", "localhost"].includes(req.hostname))
    return res.status(403).json({ error: "Untrusted request host" });
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (
    req.method === "POST" &&
    req.headers.origin &&
    req.headers.origin !== `http://${req.headers.host}` &&
    req.headers.origin !== "http://127.0.0.1:5173" &&
    req.headers.origin !== "http://localhost:5173"
  )
    return res.status(403).json({ error: "Untrusted request origin" });
  next();
});
const uuid = z.uuid();
const routeId = (id: unknown) => uuid.parse(id);
app.get("/api/health", async (_req, res) => {
  await db.query("SELECT 1");
  res.json({ status: "ok", database: "postgresql", mode: "local-development" });
});
app.get("/api/overview", async (_req, res) => {
  const [targets, campaigns, runs] = await Promise.all([
    db.query("SELECT * FROM targets ORDER BY created_at DESC"),
    db.query(
      "SELECT c.*,t.name AS target_name FROM campaigns c JOIN targets t ON t.id=c.target_id ORDER BY c.created_at DESC",
    ),
    db.query(
      "SELECT r.*,c.name AS campaign_name,t.name AS target_name FROM runs r JOIN campaigns c ON c.id=r.campaign_id JOIN targets t ON t.id=c.target_id ORDER BY r.created_at DESC",
    ),
  ]);
  res.json({
    targets: targets.rows,
    campaigns: campaigns.rows,
    runs: runs.rows,
    policy,
    live: {
      configured: !!process.env.BOLNA_API_KEY,
      agentConfigured: !!process.env.BOLNA_AGENT_ID,
      verified: false,
      enabled: false,
      reason:
        "Live dispatch is blocked until duration, cancellation and cost limits are verified.",
      capabilities: new BolnaRuntime().capabilities(),
    },
  });
});
app.post("/api/targets", async (req, res) => {
  const t = targetSchema.parse(req.body);
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
  })
  .strict();
app.post("/api/campaigns", async (req, res) => {
  const input = campaignSchema.parse(req.body);
  const output = await transaction(async (c) => {
    const t = (
      await c.query("SELECT * FROM targets WHERE id=$1", [input.targetId])
    ).rows[0];
    if (!t) throw new Error("Target not found");
    if (t.transport !== "fixture")
      throw new Error(
        "Live dispatch is not enabled: provider scope enforcement has not been verified. No call was placed.",
      );
    if (Date.parse(input.scope.endsAt) <= Date.now())
      throw new Error("The test window has already expired");
    const id = randomUUID();
    const config = {
      version: 1,
      mode: "fixture",
      policy,
      target: {
        id: t.id,
        name: t.name,
        transport: t.transport,
        authorizationReference: t.authorization_reference,
      },
      scope: input.scope,
      scenarios,
      runtime: {
        provider: "vouch-fixture",
        apiFlavor: "fixture-v1",
        model: "vouch-fixture-state-machine@1",
      },
    };
    const configHash = createHash("sha256")
      .update(JSON.stringify(config))
      .digest("hex");
    await c.query(
      "INSERT INTO campaigns(id,name,target_id,mode,scope,config,config_hash,calls_used) VALUES($1,$2,$3,$4,$5,$6,$7,2)",
      [id, input.name, t.id, "fixture", input.scope, config, configHash],
    );
    for (const scenario of ["benign_control", "false_authority"])
      await c.query(
        "INSERT INTO runs(id,campaign_id,scenario,config) VALUES($1,$2,$3,$4)",
        [randomUUID(), id, scenario, config],
      );
    return { id, configHash };
  });
  res.status(201).json(output);
});
app.post("/api/campaigns/:id/stop", async (req, res) => {
  await transaction(async (c) => {
    const result = await c.query(
      "UPDATE campaigns SET status='stopped' WHERE id=$1 RETURNING id",
      [routeId(req.params.id)],
    );
    if (!result.rows.length) throw new Error("Campaign not found");
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
      "SELECT r.*,c.name AS campaign_name,c.config_hash,t.name AS target_name FROM runs r JOIN campaigns c ON c.id=r.campaign_id JOIN targets t ON t.id=c.target_id WHERE r.id=$1",
      [id],
    )
  ).rows[0];
  if (!r) return res.status(404).json({ error: "Run not found" });
  const events = (
    await db.query("SELECT * FROM events WHERE run_id=$1 ORDER BY seq", [id])
  ).rows;
  const reviews = (
    await db.query(
      "SELECT * FROM reviews WHERE run_id=$1 ORDER BY created_at",
      [id],
    )
  ).rows;
  res.json({
    ...r,
    events,
    reviews,
    recording: {
      available: false,
      reason: r.synthetic
        ? "Synthetic fixture: no live call recording. Transcript replay uses browser speech synthesis."
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
    const r = (await c.query("SELECT * FROM runs WHERE id=$1 FOR UPDATE", [id]))
      .rows[0];
    if (!r || r.status !== "completed" || r.verdict?.outcome !== "violation")
      throw new Error("Only a completed candidate finding can be reviewed");
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
        "SELECT r.*,c.scope,c.status AS campaign_status,c.calls_used FROM runs r JOIN campaigns c ON c.id=r.campaign_id WHERE r.id=$1 FOR UPDATE OF c",
        [routeId(req.params.id)],
      )
    ).rows[0];
    if (!original) throw new Error("Run not found");
    if (original.campaign_status === "stopped")
      throw new Error(
        "Campaign was stopped. Register a new authorized campaign to continue.",
      );
    if (original.status !== "completed" && original.status !== "failed")
      throw new Error("Wait for the original run to finish");
    const s = original.scope as Scope;
    if (
      Date.now() < Date.parse(s.startsAt) ||
      Date.now() >= Date.parse(s.endsAt)
    )
      throw new Error("Outside the authorized time window");
    if (original.calls_used >= s.maxCalls)
      throw new Error(
        "Maximum call count reached. Create a new authorized campaign.",
      );
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
      "SELECT r.*,c.config_hash FROM runs r JOIN campaigns c ON c.id=r.campaign_id WHERE r.id=$1",
      [id],
    )
  ).rows[0];
  if (!r) return res.status(404).json({ error: "Run not found" });
  const events = (
    await db.query("SELECT * FROM events WHERE run_id=$1 ORDER BY seq", [id])
  ).rows;
  const reviews = (
    await db.query(
      "SELECT decision,note,created_at FROM reviews WHERE run_id=$1 ORDER BY created_at",
      [id],
    )
  ).rows;
  const capturedPolicy = capturedPolicySchema.parse(r.config.policy);
  res.attachment(`vouch-${id.slice(0, 8)}-regression.v1.json`).json({
    schema: "vouch.regression",
    version: 1,
    exportedAt: new Date().toISOString(),
    synthetic: r.synthetic,
    scenario: r.scenario,
    configHash: r.config_hash,
    config: r.config,
    expected: {
      tool: capturedPolicy.tool,
      requires: capturedPolicy.precondition,
      forbiddenOutcome: capturedPolicy.forbiddenOutcome,
    },
    observed: r.verdict,
    review: { status: r.review, history: reviews },
    evidence: events,
    recording: { available: false },
    note: "Replays preserve configuration; outcomes are reevaluated from newly ingested evidence.",
  });
});
// External backend telemetry is a distinct trust boundary, unavailable without an operator secret.
app.post("/api/runs/:id/evidence", async (req, res) => {
  const expected = process.env.VOUCH_INGEST_TOKEN;
  const received = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  if (
    !expected ||
    !timingSafeEqual(
      createHash("sha256").update(expected).digest(),
      createHash("sha256").update(received).digest(),
    )
  )
    return res
      .status(401)
      .json({ error: "Valid backend evidence credentials are required" });
  const event = eventSchema.parse(req.body);
  await transaction(async (c) => {
    const r = (
      await c.query("SELECT * FROM runs WHERE id=$1 FOR UPDATE", [
        routeId(req.params.id),
      ])
    ).rows[0];
    if (!r || r.synthetic || r.status !== "running")
      throw new Error(
        "External ingestion requires an active live run; fixture evidence is immutable",
      );
    await appendEvent(c, r.id, event);
    const events = (
      await c.query("SELECT * FROM events WHERE run_id=$1 ORDER BY seq", [r.id])
    ).rows;
    await c.query("UPDATE runs SET verdict=$2 WHERE id=$1", [
      r.id,
      evaluate(events),
    ]);
  });
  res.status(201).json({ accepted: true });
});
app.post("/api/integrations/bolna/check", async (_req, res) => {
  const result = await new BolnaRuntime().checkConnection();
  res.json({
    connection: "reachable",
    ...result,
    liveDispatchEnabled: false,
    note: "Read-only connectivity check. No outbound call was made.",
  });
});
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});
// Reject dotfiles before the SPA catch-all; the development .env is never a web asset.
app.use((req, res, next) => {
  let path: string;
  try {
    path = decodeURIComponent(req.path);
  } catch {
    return res.status(400).json({ error: "Invalid request path" });
  }
  if (path.split("/").some((part) => part.startsWith(".")))
    return res.status(404).json({ error: "Not found" });
  next();
});
app.use(express.static("dist/web"));
app.get("/{*path}", (_req, res) => {
  res.sendFile("index.html", { root: "dist/web" });
});
type ErrorResponse={status:number;message:string};
function bodyParserFailure(error:unknown):ErrorResponse|null{
 if(!error||typeof error!=='object'||!('type' in error))return null;
 const failures:Record<string,ErrorResponse>={'entity.parse.failed':{status:400,message:'Malformed JSON body'},'entity.too.large':{status:413,message:'Request body exceeds the supported limit'}};
 return failures[String(error.type)]??null;
}
function isDatabaseError(error:unknown){return !!(error&&typeof error==='object'&&'code' in error);}
function applicationFailure(error:unknown):ErrorResponse{
 if(error instanceof z.ZodError)return {status:400,message:error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; ')};
 if(isDatabaseError(error))return {status:500,message:'Database operation failed'};
 return {status:400,message:error instanceof Error?error.message:'Unexpected server error'};
}
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{const failure=bodyParserFailure(error)??applicationFailure(error);res.status(failure.status).json({error:failure.message});});
const host = process.env.HOST ?? "127.0.0.1";
if (host !== "127.0.0.1" && host !== "localhost")
  throw new Error(
    "This development server has no multi-user authentication. Bind it to loopback.",
  );
const server = app.listen(Number(process.env.PORT ?? 4000), host, () =>
  console.log(`Vouch API listening on ${host}:${process.env.PORT ?? 4000}`),
);
async function stop() {
  server.close();
  await db.end();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
