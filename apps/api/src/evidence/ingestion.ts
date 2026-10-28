import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import express from "express";
import type { PoolClient, QueryResult } from "pg";
import { z } from "zod";
import {
  evaluate,
  eventSchema,
  type EvidenceEvent,
} from "../../../../packages/core/src/index";
import {
  canonicalJson,
  assertConfigurationHash,
} from "../campaigns/configuration";
import {
  db,
  transaction,
  withSystemDatabase,
  withWorkspaceDatabase,
} from "../database/client";
import { appendEvent } from "../execution/fixture";
import {
  archiveRecording,
  artifactRouter,
  migrateArtifacts,
  listRunArtifacts,
  recordingRetentionExpiry,
  runRetentionExpiry,
  purgeRunArtifacts,
} from "./artifacts";
import {
  BolnaRuntime,
  assertExecutionIdentity,
  type ExecutionSnapshot,
} from "../providers/bolna/runtime";

type Queryable = {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
};
type EvidenceRole = "backend" | "provider";
const roleSchema = z.enum(["backend", "provider"]);
const batchSchema = z
  .object({
    batchId: z.uuid(),
    providerExecutionId: z.string().min(1).max(200),
    startSequence: z.number().int().min(1),
    events: z.array(eventSchema).max(128),
    complete: z
      .object({
        totalEvents: z.number().int().min(0),
        at: z.number().int().min(0).max(300000),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) => value.events.length > 0 || value.complete !== undefined,
    "An event or completion marker is required",
  );
export async function migrateEvidence(c: Queryable) {
  await c.query(`CREATE TABLE IF NOT EXISTS evidence_streams(
    run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    role text NOT NULL CHECK(role IN ('backend','provider')), next_seq integer NOT NULL DEFAULT 1,
    complete boolean NOT NULL DEFAULT false, complete_at integer,
    PRIMARY KEY(run_id,role));
    CREATE TABLE IF NOT EXISTS evidence_receipts(
    run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    role text NOT NULL, batch_id uuid NOT NULL, nonce text NOT NULL,
    digest text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(run_id,role,batch_id), UNIQUE(run_id,role,nonce));
    CREATE TABLE IF NOT EXISTS provider_evidence_cursors(
    run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
    transcript_digest text, snapshot_digest text, recording_failure text,
    recording_redacted boolean NOT NULL DEFAULT false,
    transcript_redacted boolean NOT NULL DEFAULT false);
    ALTER TABLE provider_evidence_cursors ADD COLUMN IF NOT EXISTS recording_redacted boolean NOT NULL DEFAULT false;
    ALTER TABLE provider_evidence_cursors ADD COLUMN IF NOT EXISTS transcript_redacted boolean NOT NULL DEFAULT false;`);
  await migrateArtifacts(c);
}
function masterKey() {
  const raw = process.env.VOUCH_EVIDENCE_SIGNING_KEY;
  if (
    !raw ||
    !/^[A-Za-z0-9+/]{43}=$/.test(raw) ||
    Buffer.from(raw, "base64").length !== 32
  )
    throw new Error(
      "VOUCH_EVIDENCE_SIGNING_KEY must be a base64-encoded 32-byte key",
    );
  return Buffer.from(raw, "base64");
}
function runSigningKey(runId: string, role: EvidenceRole) {
  return createHmac("sha256", masterKey())
    .update(`vouch-evidence-v1\n${runId}\n${role}`)
    .digest("base64url");
}
function verifySignature(
  req: express.Request,
  runId: string,
  role: EvidenceRole,
) {
  const timestamp = req.header("x-vouch-timestamp") ?? "";
  const nonce = req.header("x-vouch-nonce") ?? "";
  const signature = req.header("x-vouch-signature") ?? "";
  if (
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > 300000 ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return null;
  const canonical = canonicalJson(req.body);
  const expected = createHmac("sha256", runSigningKey(runId, role))
    .update(`${timestamp}\n${nonce}\n${canonical}`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null;
  return {
    nonce,
    digest: createHash("sha256").update(canonical).digest("hex"),
  };
}
async function liveRun(c: Queryable, runId: string) {
  return (
    await c.query(
      "SELECT r.id,r.synthetic,r.status,r.workspace_id,r.finished_at,l.dispatch_started_at,l.deadline_at,l.provider_execution_id,l.terminal_at,c.scope FROM runs r JOIN campaigns c ON c.id=r.campaign_id JOIN live_executions l ON l.run_id=r.id WHERE r.id=$1",
      [runId],
    )
  ).rows[0];
}
function checkEvent(
  event: z.infer<typeof eventSchema>,
  role: EvidenceRole,
  duration: number,
) {
  if (event.at > duration * 1000)
    throw new Error("Evidence timestamp exceeds the captured duration");
  if (role === "provider") {
    if (
      !["transcript", "provider.event"].includes(event.kind) ||
      event.source === "backend"
    )
      throw new Error("Provider messages cannot supply backend facts");
    if (event.data.verificationLogComplete !== undefined)
      throw new Error("Provider messages cannot mark backend logs complete");
    return;
  }
  if (
    event.source !== "backend" ||
    ![
      "tool.requested",
      "tool.executed",
      "identity.verified",
      "backend.state",
    ].includes(event.kind)
  )
    throw new Error("Backend connector accepts only trusted backend facts");
  if (event.data.accountId !== "SYN-1042")
    throw new Error("Evidence does not match the authorized fictional account");
}
function assertDeliveryWindow(run: Record<string, unknown>) {
  const scope = run.scope as { maxDurationSeconds: number; endsAt: string };
  const configured = Number(process.env.VOUCH_EVIDENCE_GRACE_SECONDS ?? 30);
  if (!Number.isSafeInteger(configured) || configured < 0 || configured > 300)
    throw new Error("VOUCH_EVIDENCE_GRACE_SECONDS is invalid");
  const deadlines = [
    run.deadline_at
      ? new Date(String(run.deadline_at)).getTime()
      : new Date(String(run.dispatch_started_at)).getTime() +
        scope.maxDurationSeconds * 1000,
    Date.parse(scope.endsAt),
  ];
  if (run.terminal_at)
    deadlines.push(new Date(String(run.terminal_at)).getTime());
  const deadline = Math.min(...deadlines) + configured * 1000;
  if (!Number.isFinite(deadline) || Date.now() > deadline)
    throw new Error("The evidence delivery window has expired");
}
async function receiveBatch(
  req: express.Request,
  res: express.Response,
  role: EvidenceRole,
) {
  const runId = z.uuid().parse(req.params.id);
  const signature = verifySignature(req, runId, role);
  if (!signature)
    return res.status(401).json({ error: "Invalid evidence signature" });
  const body = batchSchema.parse(req.body);
  const run = await withSystemDatabase(() => liveRun(db, runId));
  if (
    !run ||
    run.synthetic ||
    !run.provider_execution_id ||
    run.provider_execution_id !== body.providerExecutionId
  )
    return res
      .status(404)
      .json({ error: "Correlated live execution not found" });
  const result = await withWorkspaceDatabase(run.workspace_id, () =>
    transaction(async (c) => {
      await c.query("SELECT id FROM runs WHERE id=$1 FOR UPDATE", [runId]);
      const current = await liveRun(c, runId);
      const receipt = (
        await c.query(
          "SELECT digest FROM evidence_receipts WHERE run_id=$1 AND role=$2 AND batch_id=$3",
          [runId, role, body.batchId],
        )
      ).rows[0];
      if (receipt) {
        if (receipt.digest !== signature.digest)
          throw new Error(
            "Batch identifier was reused with different evidence",
          );
        return { accepted: 0, duplicate: true };
      }
      if (
        !current ||
        !["running", "awaiting_evidence"].includes(current.status)
      )
        throw new Error("This run no longer accepts evidence");
      if (current.provider_execution_id !== body.providerExecutionId)
        throw new Error("The provider execution correlation changed");
      assertDeliveryWindow(current);
      const duplicateNonce = await c.query(
        "SELECT 1 FROM evidence_receipts WHERE run_id=$1 AND role=$2 AND nonce=$3",
        [runId, role, signature.nonce],
      );
      if (duplicateNonce.rows.length)
        throw new Error("Evidence nonce has already been used");
      await c.query(
        "INSERT INTO evidence_streams(run_id,role) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [runId, role],
      );
      const stream = (
        await c.query(
          "SELECT * FROM evidence_streams WHERE run_id=$1 AND role=$2 FOR UPDATE",
          [runId, role],
        )
      ).rows[0];
      if (stream.complete)
        throw new Error("The evidence stream is already complete");
      if (body.startSequence !== stream.next_seq)
        throw new Error("Evidence sequence has a gap or was replayed");
      for (const [index, event] of body.events.entries()) {
        checkEvent(event, role, current.scope.maxDurationSeconds);
        await appendEvent(c, runId, {
          ...event,
          data: {
            ...event.data,
            connectorSequence: body.startSequence + index,
            providerExecutionId: body.providerExecutionId,
          },
        });
      }
      const nextSequence = body.startSequence + body.events.length;
      if (body.complete) {
        if (role !== "backend")
          throw new Error(
            "Only the backend connector can mark verification evidence complete",
          );
        if (body.complete.totalEvents !== nextSequence - 1)
          throw new Error("Completion count does not match accepted evidence");
        const latest = (
          await c.query(
            "SELECT COALESCE(MAX(at),0) AS at FROM events WHERE run_id=$1 AND source='backend'",
            [runId],
          )
        ).rows[0];
        if (
          body.complete.at < latest.at ||
          body.complete.at > current.scope.maxDurationSeconds * 1000
        )
          throw new Error("Invalid evidence completion timestamp");
        await appendEvent(c, runId, {
          kind: "provider.event",
          source: "backend",
          at: body.complete.at,
          data: {
            verificationLogComplete: true,
            connectorSequence: nextSequence,
            providerExecutionId: body.providerExecutionId,
          },
        });
      }
      await c.query(
        "UPDATE evidence_streams SET next_seq=$3,complete=$4,complete_at=$5 WHERE run_id=$1 AND role=$2",
        [
          runId,
          role,
          nextSequence,
          Boolean(body.complete),
          body.complete?.at ?? null,
        ],
      );
      await c.query(
        "INSERT INTO evidence_receipts(run_id,role,batch_id,nonce,digest) VALUES($1,$2,$3,$4,$5)",
        [runId, role, body.batchId, signature.nonce, signature.digest],
      );
      await finalizeRunEvidence(c, runId);
      return {
        accepted: body.events.length,
        duplicate: false,
        complete: Boolean(body.complete),
        nextSequence,
      };
    }),
  );
  res.json(result);
}
export async function evidenceReady(c: Queryable, runId: string) {
  return (
    (
      await c.query(
        "SELECT complete FROM evidence_streams WHERE run_id=$1 AND role='backend'",
        [runId],
      )
    ).rows[0]?.complete === true
  );
}
export async function finalizeRunEvidence(c: Queryable, runId: string) {
  // Serialize evaluation with connector appends. Otherwise the worker could
  // overwrite a freshly ingested verdict with an older event snapshot.
  await c.query("SELECT id FROM runs WHERE id=$1 FOR UPDATE", [runId]);
  const events = (
    await c.query("SELECT * FROM events WHERE run_id=$1 ORDER BY seq", [runId])
  ).rows as EvidenceEvent[];
  const verdict = evaluate(events);
  await c.query("UPDATE runs SET verdict=$2 WHERE id=$1", [runId, verdict]);
  return verdict;
}
export async function ingestLiveExecution(
  c: PoolClient,
  runId: string,
  snapshot: ExecutionSnapshot,
) {
  const run = await liveRun(c, runId);
  if (!run || run.synthetic || run.provider_execution_id !== snapshot.id)
    throw new Error("Provider snapshot does not match the live execution");
  await c.query("SELECT id FROM runs WHERE id=$1 FOR UPDATE", [runId]);
  await c.query(
    "INSERT INTO provider_evidence_cursors(run_id) VALUES($1) ON CONFLICT DO NOTHING",
    [runId],
  );
  const cursor = (
    await c.query(
      "SELECT * FROM provider_evidence_cursors WHERE run_id=$1 FOR UPDATE",
      [runId],
    )
  ).rows[0];
  const at = Math.max(
    0,
    Math.min(
      run.scope.maxDurationSeconds * 1000,
      Math.round((snapshot.durationSeconds ?? 0) * 1000),
    ),
  );
  const summary = {
    provider: "bolna",
    providerExecutionId: snapshot.id,
    status: snapshot.status,
    terminal: snapshot.terminal,
    durationSeconds: snapshot.durationSeconds,
    costCents: snapshot.costCents,
    costFinalized: snapshot.costFinalized,
  };
  const digest = createHash("sha256")
    .update(canonicalJson(summary))
    .digest("hex");
  if (cursor.snapshot_digest !== digest) {
    await appendEvent(c, runId, {
      kind: "provider.event",
      source: "provider",
      at,
      data: summary,
    });
    await c.query(
      "UPDATE provider_evidence_cursors SET snapshot_digest=$2 WHERE run_id=$1",
      [runId, digest],
    );
  }
  if (snapshot.terminal && snapshot.transcript && !cursor.transcript_redacted) {
    const transcriptDigest = createHash("sha256")
      .update(snapshot.transcript)
      .digest("hex");
    if (cursor.transcript_digest !== transcriptDigest) {
      if (cursor.transcript_digest)
        throw new Error("Final provider transcript changed after capture");
      await appendEvent(c, runId, {
        kind: "transcript",
        source: "provider",
        at,
        data: {
          text: snapshot.transcript,
          format: "provider_transcript",
          timestampGranularity: "execution",
          providerExecutionId: snapshot.id,
        },
      });
      await c.query(
        "UPDATE provider_evidence_cursors SET transcript_digest=$2 WHERE run_id=$1",
        [runId, transcriptDigest],
      );
    }
  }
}
export async function ingestProviderSnapshot(
  runId: string,
  providerExecutionId: string,
  snapshot: ExecutionSnapshot,
) {
  if (snapshot.id !== providerExecutionId)
    throw new Error("Provider execution correlation failed");
  await transaction((c) => ingestLiveExecution(c, runId, snapshot));
  if (snapshot.terminal && snapshot.recordingUrl) {
    try {
      await archiveRecording(runId, providerExecutionId, snapshot.recordingUrl);
    } catch {
      await db.query(
        "UPDATE provider_evidence_cursors SET recording_failure=$2 WHERE run_id=$1",
        [
          runId,
          "Recording could not be archived. Check the encryption key, allowlist, retention configuration and provider availability.",
        ],
      );
    }
  }
}
export async function recoverProviderTranscript(
  runId: string,
  snapshot: ExecutionSnapshot,
) {
  return transaction(async (c) => {
    await c.query("SELECT id FROM runs WHERE id=$1 FOR UPDATE", [runId]);
    const run = await liveRun(c, runId);
    if (
      !run ||
      run.synthetic ||
      run.provider_execution_id !== snapshot.id ||
      !["completed", "failed", "cancelled"].includes(run.status)
    )
      throw new Error("Finished provider execution correlation is required");
    const expiry = runRetentionExpiry(run.finished_at);
    if (expiry && expiry.getTime() <= Date.now())
      throw new Error("Run retention has expired");
    await c.query(
      "INSERT INTO provider_evidence_cursors(run_id) VALUES($1) ON CONFLICT DO NOTHING",
      [runId],
    );
    const cursor = (
      await c.query(
        "SELECT transcript_digest,transcript_redacted FROM provider_evidence_cursors WHERE run_id=$1 FOR UPDATE",
        [runId],
      )
    ).rows[0];
    if (cursor.transcript_redacted) return "redacted" as const;
    if (cursor.transcript_digest) return "available" as const;
    const existing = (
      await c.query(
        "SELECT data FROM events WHERE run_id=$1 AND kind='transcript' ORDER BY seq",
        [runId],
      )
    ).rows;
    if (existing.length) {
      await c.query(
        "UPDATE provider_evidence_cursors SET transcript_digest=$2 WHERE run_id=$1",
        [
          runId,
          createHash("sha256").update(canonicalJson(existing)).digest("hex"),
        ],
      );
      return "available" as const;
    }
    if (!snapshot.terminal || !snapshot.transcript) return "missing" as const;
    const digest = createHash("sha256")
      .update(snapshot.transcript)
      .digest("hex");
    const at = Math.max(
      0,
      Math.min(
        run.scope.maxDurationSeconds * 1000,
        Math.round((snapshot.durationSeconds ?? 0) * 1000),
      ),
    );
    await appendEvent(c, runId, {
      kind: "transcript",
      source: "provider",
      at,
      data: {
        text: snapshot.transcript,
        format: "provider_transcript",
        timestampGranularity: "execution",
        providerExecutionId: snapshot.id,
        recoveredAfterCompletion: true,
      },
    });
    await c.query(
      "UPDATE provider_evidence_cursors SET transcript_digest=$2 WHERE run_id=$1",
      [runId, digest],
    );
    return "captured" as const;
  });
}
export const signedEvidenceRouter = express.Router();
signedEvidenceRouter.post("/runs/:id/:role-events", async (req, res) => {
  await receiveBatch(req, res, roleSchema.parse(req.params.role));
});
export const evidenceRouter = express.Router();
evidenceRouter.use(artifactRouter);
evidenceRouter.post("/runs/:id/artifacts/redact", async (req, res) => {
  if (res.locals.auth?.workspace?.role !== "owner")
    return res
      .status(403)
      .json({ error: "Workspace owner access is required" });
  const runId = z.uuid().parse(req.params.id);
  const result = await transaction(async (c) => {
    const run = (
      await c.query(
        "SELECT id,status,synthetic FROM runs WHERE id=$1 FOR UPDATE",
        [runId],
      )
    ).rows[0];
    if (!run || run.synthetic) return null;
    if (!["completed", "failed", "cancelled"].includes(run.status))
      throw new Error("Only a finished run can have its recording redacted");
    const previous = (
      await c.query(
        "SELECT recording_redacted FROM provider_evidence_cursors WHERE run_id=$1",
        [runId],
      )
    ).rows[0];
    const redacted = await purgeRunArtifacts([runId], { client: c });
    await c.query(
      "INSERT INTO provider_evidence_cursors(run_id,recording_redacted) VALUES($1,true) ON CONFLICT(run_id) DO UPDATE SET recording_redacted=true",
      [runId],
    );
    await c.query(
      "UPDATE live_executions SET last_snapshot=jsonb_set(jsonb_set(last_snapshot,'{recordingUrl}','null'::jsonb),'{raw}',COALESCE(last_snapshot->'raw','{}'::jsonb)-'recording_url'),cleanup_next_at=CASE WHEN cleanup_state IN ('pending','retry') THEN now() ELSE cleanup_next_at END WHERE run_id=$1",
      [runId],
    );
    if (!previous?.recording_redacted)
      await appendEvent(c, runId, {
        kind: "provider.event",
        source: "provider",
        at: 0,
        data: {
          operation: "recording_redacted",
          redactedAt: new Date().toISOString(),
          recordingCount: redacted,
        },
      });
    return { redacted, futureRecoveryDisabled: true };
  });
  if (!result) return res.status(404).json({ error: "Live run not found" });
  res.json(result);
});
evidenceRouter.post("/runs/:id/artifacts/retry", async (req, res) => {
  if (res.locals.auth?.workspace?.role !== "owner")
    return res
      .status(403)
      .json({ error: "Workspace owner access is required" });
  const runId = z.uuid().parse(req.params.id);
  const run = (
    await db.query(
      "SELECT r.id,r.synthetic,r.status,r.finished_at,r.config,c.config_hash,c.config_hash_algorithm,l.provider_execution_id,l.caller_agent_id,p.recording_redacted,p.transcript_digest,p.transcript_redacted FROM runs r JOIN campaigns c ON c.id=r.campaign_id JOIN live_executions l ON l.run_id=r.id LEFT JOIN provider_evidence_cursors p ON p.run_id=r.id WHERE r.id=$1",
      [runId],
    )
  ).rows[0];
  if (!run || run.synthetic)
    return res.status(404).json({ error: "Live run not found" });
  if (
    !["completed", "failed", "cancelled"].includes(run.status) ||
    !run.finished_at ||
    !run.provider_execution_id ||
    !run.caller_agent_id
  )
    return res.status(409).json({
      error:
        "Artifact retry requires a finished, correlated provider execution",
    });
  const runExpiry = runRetentionExpiry(run.finished_at);
  if (runExpiry && runExpiry.getTime() <= Date.now())
    return res.status(410).json({
      error: "The run retention window expired. Artifacts cannot be recreated.",
    });
  const expired =
    (
      await db.query(
        "SELECT 1 FROM artifacts WHERE run_id=$1 AND (redacted_at IS NOT NULL OR expires_at<=now()) LIMIT 1",
        [runId],
      )
    ).rows.length > 0;
  const recordingBlocked =
    run.recording_redacted ||
    expired ||
    recordingRetentionExpiry(run.finished_at).getTime() <= Date.now();
  const existing = await listRunArtifacts(runId);
  if (
    (existing.length || recordingBlocked) &&
    (run.transcript_digest || run.transcript_redacted)
  )
    return res.json({
      artifacts: existing,
      alreadyAvailable: true,
      recording: recordingBlocked ? "redacted_or_expired" : "available",
      transcript: run.transcript_redacted ? "redacted" : "available",
    });
  await db.query(
    "INSERT INTO provider_evidence_cursors(run_id) VALUES($1) ON CONFLICT DO NOTHING",
    [runId],
  );
  try {
    assertConfigurationHash(
      run.config,
      run.config_hash,
      run.config_hash_algorithm,
    );
    const target = z
      .object({
        target: z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) }),
      })
      .parse(run.config).target;
    // A read-only lookup recovers previously missing provider artifacts only.
    // No dispatch, backend facts, evaluation or verdict mutation occurs here.
    const snapshot = await new BolnaRuntime().executionSnapshot(
      run.provider_execution_id,
    );
    assertExecutionIdentity(snapshot, {
      id: run.provider_execution_id,
      agentId: run.caller_agent_id,
      phone: target.phone,
      runId,
    });
    if (!snapshot.terminal)
      return res.status(409).json({
        error:
          "Provider execution is not finalized. Retry after processing finishes.",
      });
    const transcript = await recoverProviderTranscript(runId, snapshot);
    let recording = recordingBlocked
      ? "redacted_or_expired"
      : existing.length
        ? "available"
        : "missing";
    if (!recordingBlocked && !existing.length && snapshot.recordingUrl) {
      const id = await archiveRecording(
        runId,
        run.provider_execution_id,
        snapshot.recordingUrl,
      );
      recording = id ? "captured" : "redacted_or_expired";
    }
    const missing = recording === "missing" || transcript === "missing";
    const message = missing
      ? "Some provider artifacts are not yet available. Retry after the provider finishes processing."
      : null;
    await db.query(
      "UPDATE provider_evidence_cursors SET recording_failure=$2 WHERE run_id=$1",
      [runId, message],
    );
    await db.query(
      "UPDATE live_executions SET cleanup_next_at=CASE WHEN cleanup_state IN ('pending','retry') THEN now() ELSE cleanup_next_at END WHERE run_id=$1",
      [runId],
    );
    return res.status(missing ? 409 : 200).json({
      ...(message ? { error: message } : {}),
      artifacts: await listRunArtifacts(runId),
      alreadyAvailable: false,
      recording,
      transcript,
    });
  } catch {
    const message =
      "Provider artifacts could not be retrieved. Check provider availability, recording hosts, media credentials and the artifact encryption key.";
    await db.query(
      "UPDATE provider_evidence_cursors SET recording_failure=$2 WHERE run_id=$1",
      [runId, message],
    );
    return res.status(502).json({ error: message });
  }
});
evidenceRouter.post("/runs/:id/redact-transcript", async (req, res) => {
  if (res.locals.auth?.workspace?.role !== "owner")
    return res
      .status(403)
      .json({ error: "Workspace owner access is required" });
  const runId = z.uuid().parse(req.params.id);
  const result = await transaction(async (c) => {
    const run = (
      await c.query("SELECT id,status FROM runs WHERE id=$1 FOR UPDATE", [
        runId,
      ])
    ).rows[0];
    if (!run) return null;
    if (!["completed", "failed", "cancelled"].includes(run.status))
      throw new Error("Only a finished run can have its transcript redacted");
    await c.query(
      "INSERT INTO provider_evidence_cursors(run_id,transcript_redacted) VALUES($1,true) ON CONFLICT(run_id) DO UPDATE SET transcript_redacted=true",
      [runId],
    );
    const rows = (
      await c.query(
        "SELECT id,data FROM events WHERE run_id=$1 AND kind='transcript'",
        [runId],
      )
    ).rows;
    const redactedAt = new Date().toISOString();
    let count = 0;
    for (const row of rows) {
      if (
        typeof row.data.text !== "string" ||
        (row.data.text === "[Transcript redacted by workspace owner]" &&
          row.data.redacted === true)
      )
        continue;
      const digest = createHash("sha256").update(row.data.text).digest("hex");
      await c.query("UPDATE events SET data=$2::jsonb WHERE id=$1", [
        row.id,
        JSON.stringify({
          text: "[Transcript redacted by workspace owner]",
          redacted: true,
          originalTextSha256: digest,
          originalPayloadSha256: createHash("sha256")
            .update(canonicalJson(row.data))
            .digest("hex"),
          redactedAt,
        }),
      ]);
      count++;
    }
    await c.query(
      "UPDATE live_executions SET last_snapshot=jsonb_set(jsonb_set(last_snapshot,'{transcript}','null'::jsonb),'{raw}',COALESCE(last_snapshot->'raw','{}'::jsonb)-'transcript') WHERE run_id=$1 AND last_snapshot IS NOT NULL",
      [runId],
    );
    if (count)
      await appendEvent(c, runId, {
        kind: "provider.event",
        source: "provider",
        at: 0,
        data: {
          operation: "transcript_redacted",
          redactedAt,
          transcriptCount: count,
        },
      });
    return { redacted: count };
  });
  if (!result) return res.status(404).json({ error: "Run not found" });
  res.json(result);
});
evidenceRouter.get("/runs/:id/connector-credentials", async (req, res) => {
  if (res.locals.auth?.workspace?.role !== "owner")
    return res
      .status(403)
      .json({ error: "Workspace owner access is required" });
  const runId = z.uuid().parse(req.params.id);
  const run = (
    await db.query(
      "SELECT r.id,r.synthetic,l.provider_execution_id FROM runs r LEFT JOIN live_executions l ON l.run_id=r.id WHERE r.id=$1",
      [runId],
    )
  ).rows[0];
  if (!run || run.synthetic)
    return res.status(404).json({ error: "Live run not found" });
  res.setHeader("Cache-Control", "no-store");
  res.json({
    runId,
    providerExecutionId: run.provider_execution_id,
    signatureAlgorithm: "hmac-sha256-v1",
    canonicalization: "sha256-sorted-json-v1",
    backend: {
      endpoint: `/api/runs/${runId}/backend-events`,
      signingKey: runSigningKey(runId, "backend"),
    },
    provider: {
      endpoint: `/api/runs/${runId}/provider-events`,
      signingKey: runSigningKey(runId, "provider"),
    },
    headers: {
      timestamp: "x-vouch-timestamp",
      nonce: "x-vouch-nonce",
      signature: "x-vouch-signature",
    },
  });
});
