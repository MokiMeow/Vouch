import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import express from "express";
import { EnvHttpProxyAgent, fetch } from "undici";
import type { QueryResult } from "pg";
import { db, transaction } from "../database/client";

type Queryable = {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
};
const dispatcher = new EnvHttpProxyAgent();
const audioTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/flac",
]);
function integerSetting(name: string, fallback: number, max: number) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new Error(`${name} is invalid`);
  return value;
}
function encryptionKey() {
  const raw = process.env.VOUCH_ARTIFACT_KEY;
  if (!raw || !/^[A-Za-z0-9+/]{43}=$/.test(raw))
    throw new Error("VOUCH_ARTIFACT_KEY must be a base64-encoded 32-byte key");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32)
    throw new Error("VOUCH_ARTIFACT_KEY must contain 32 bytes");
  return key;
}
function directory() {
  return resolve(process.env.VOUCH_ARTIFACT_DIR ?? ".data/artifacts");
}
function artifactPath(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id))
    throw new Error("Invalid artifact identifier");
  return resolve(directory(), `${id}.bin`);
}

export async function listArtifacts(runId: string) {
  const { rows } = await db.query(
    "SELECT id,kind,content_type,byte_length,created_at,expires_at FROM artifacts WHERE run_id=$1 AND redacted_at IS NULL AND expires_at>now() ORDER BY created_at",
    [runId],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    contentType: row.content_type,
    byteLength: row.byte_length,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    url: `/api/runs/${runId}/artifacts/${row.id}`,
  }));
}
export const listRunArtifacts = listArtifacts;

export function runRetentionExpiry(finishedAt: unknown): Date | null {
  const configured = process.env.VOUCH_RUN_RETENTION_DAYS;
  if (configured === undefined || configured === "") return null;
  const finished = new Date(String(finishedAt)).getTime();
  if (!Number.isFinite(finished))
    throw new Error("Invalid run retention timestamp");
  return new Date(
    finished + integerSetting("VOUCH_RUN_RETENTION_DAYS", 30, 3650) * 86400000,
  );
}
export function recordingRetentionExpiry(finishedAt: unknown): Date {
  const days = integerSetting("VOUCH_ARTIFACT_RETENTION_DAYS", 30, 3650);
  const finished = finishedAt
    ? new Date(String(finishedAt)).getTime()
    : Date.now();
  if (!Number.isFinite(finished))
    throw new Error("Invalid recording retention timestamp");
  let expiry = finished + days * 86400000;
  const runExpiry = finishedAt ? runRetentionExpiry(finishedAt) : null;
  if (runExpiry) expiry = Math.min(expiry, runExpiry.getTime());
  return new Date(expiry);
}

function permittedUrl(raw: string) {
  const url = new URL(raw);
  const allowed = (process.env.VOUCH_RECORDING_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !allowed.includes(url.hostname.toLowerCase())
  )
    throw new Error("Recording host is not explicitly allowed");
  if (
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      url.hostname,
    ) ||
    url.hostname.includes(":")
  )
    throw new Error("Private recording hosts are not allowed");
  return url;
}
function recordingHeaders(url: URL): Record<string, string> {
  if (url.hostname !== "api.twilio.com") return { Accept: "audio/*" };
  const account = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const resource =
    /^\/2010-04-01\/Accounts\/(AC[0-9a-f]{32})\/Recordings\/(RE[0-9a-f]{32})(?:\.(?:wav|mp3))?$/i.exec(
      url.pathname,
    );
  if (
    !account ||
    !/^AC[0-9a-f]{32}$/i.test(account) ||
    !token ||
    !resource ||
    resource[1] !== account ||
    url.search
  )
    throw new Error(
      "Twilio recording requires an exact account-scoped media URL and configured credentials",
    );
  // Never attach Twilio credentials to a provider-controlled host or redirect.
  return {
    Accept: "audio/*",
    Authorization: `Basic ${Buffer.from(`${account}:${token}`).toString("base64")}`,
  };
}
async function downloadRecording(url: URL) {
  const max = integerSetting(
    "VOUCH_ARTIFACT_MAX_BYTES",
    32 * 1024 * 1024,
    128 * 1024 * 1024,
  );
  const response = await fetch(url, {
    dispatcher,
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: recordingHeaders(url),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("Recording download failed");
  }
  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ??
    "";
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (!audioTypes.has(contentType) || declared > max) {
    await response.body.cancel();
    throw new Error("Recording content type or length is not allowed");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > max)
        throw new Error("Recording exceeds the configured size limit");
      chunks.push(bytes);
    }
  } catch (error) {
    await response.body.cancel().catch(() => undefined);
    throw error;
  }
  if (!size) throw new Error("Recording is empty");
  return { data: Buffer.concat(chunks), contentType };
}
export async function archiveRecording(
  runId: string,
  providerExecutionId: string,
  recordingUrl: string,
) {
  const tombstone = (
    await db.query(
      "SELECT recording_redacted FROM provider_evidence_cursors WHERE run_id=$1",
      [runId],
    )
  ).rows[0];
  if (tombstone?.recording_redacted) return null;
  const existing = await db.query(
    "SELECT id FROM artifacts WHERE run_id=$1 AND provider_execution_id=$2 AND kind='recording'",
    [runId, providerExecutionId],
  );
  if (existing.rows.length) return existing.rows[0].id as string;
  const run = (
    await db.query("SELECT id,synthetic,finished_at FROM runs WHERE id=$1", [
      runId,
    ])
  ).rows[0];
  if (!run || run.synthetic) throw new Error("Live run not found");
  const expiresAt = recordingRetentionExpiry(run.finished_at);
  if (expiresAt.getTime() <= Date.now())
    throw new Error("The recording retention window has expired");
  const key = encryptionKey();
  const { data, contentType } = await downloadRecording(
    permittedUrl(recordingUrl),
  );
  const id = randomUUID();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${id}:${runId}:${providerExecutionId}`));
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const temporary = `${artifactPath(id)}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, encrypted, { mode: 0o600, flag: "wx" });
    await rename(temporary, artifactPath(id));
    const published = await transaction(async (c) => {
      // Discard and retention use this same run lock. A download that began
      // before an owner discarded missing audio must not recreate it later.
      const current = (
        await c.query(
          "SELECT id,finished_at FROM runs WHERE id=$1 FOR UPDATE",
          [runId],
        )
      ).rows[0];
      if (!current) return null;
      const privacy = (
        await c.query(
          "SELECT recording_redacted FROM provider_evidence_cursors WHERE run_id=$1",
          [runId],
        )
      ).rows[0];
      if (privacy?.recording_redacted) return null;
      const prior = (
        await c.query(
          "SELECT id FROM artifacts WHERE run_id=$1 AND provider_execution_id=$2 AND kind='recording'",
          [runId, providerExecutionId],
        )
      ).rows[0];
      if (prior) return prior.id as string;
      const finalExpiry = new Date(
        Math.min(
          expiresAt.getTime(),
          recordingRetentionExpiry(current.finished_at).getTime(),
        ),
      );
      if (finalExpiry.getTime() <= Date.now()) return null;
      await c.query(
        "INSERT INTO artifacts(id,run_id,kind,content_type,byte_length,sha256,iv,auth_tag,provider_execution_id,expires_at) VALUES($1,$2,'recording',$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          runId,
          contentType,
          data.length,
          createHash("sha256").update(data).digest("hex"),
          iv.toString("base64"),
          tag.toString("base64"),
          providerExecutionId,
          finalExpiry,
        ],
      );
      return id;
    });
    if (published !== id) await unlink(artifactPath(id));
    return published;
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    await unlink(artifactPath(id)).catch(() => undefined);
    throw error;
  }
}
async function deleteArtifact(runId: string, id: string, client?: Queryable) {
  const redact = async (c: Queryable) => {
    const row = (
      await c.query(
        "SELECT id FROM artifacts WHERE id=$1 AND run_id=$2 FOR UPDATE",
        [id, runId],
      )
    ).rows[0];
    if (!row) return false;
    await c.query(
      "UPDATE artifacts SET redacted_at=COALESCE(redacted_at,now()) WHERE id=$1",
      [id],
    );
    await c.query(
      "INSERT INTO provider_evidence_cursors(run_id,recording_redacted) VALUES($1,true) ON CONFLICT(run_id) DO UPDATE SET recording_redacted=true",
      [runId],
    );
    await unlink(artifactPath(id)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    return true;
  };
  return client ? redact(client) : transaction(redact);
}
// Call before removing parent run/campaign rows so cascade deletion cannot
// orphan ciphertext. The redaction marker remains until parent retention runs.
export async function purgeRunArtifacts(
  runIds: string[],
  options: { dryRun?: boolean; client?: Queryable } = {},
) {
  if (runIds.length > 1000 || runIds.some((id) => !/^[0-9a-f-]{36}$/.test(id)))
    throw new Error("Invalid artifact retention run batch");
  if (!runIds.length) return 0;
  const rows = (
    await (options.client ?? db).query(
      "SELECT id,run_id FROM artifacts WHERE run_id=ANY($1::uuid[])",
      [runIds],
    )
  ).rows;
  if (options.dryRun) return rows.length;
  let redacted = 0;
  for (const row of rows)
    if (await deleteArtifact(row.run_id, row.id, options.client)) redacted++;
  return redacted;
}
export const redactRunArtifacts = purgeRunArtifacts;
export async function purgeExpiredArtifacts(
  options: { dryRun?: boolean; limit?: number } = {},
) {
  const limit = options.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Invalid retention batch limit");
  const { rows } = await db.query(
    "SELECT id,run_id FROM artifacts WHERE expires_at<=now() OR redacted_at IS NOT NULL ORDER BY expires_at LIMIT $1",
    [limit],
  );
  if (options.dryRun) return { deleted: 0, pending: rows.length };
  let deleted = 0;
  for (const row of rows) {
    if (await deleteArtifact(row.run_id, row.id)) {
      await db.query("DELETE FROM artifacts WHERE id=$1", [row.id]);
      deleted++;
    }
  }
  const remaining = (
    await db.query(
      "SELECT count(*) AS count FROM artifacts WHERE expires_at<=now() OR redacted_at IS NOT NULL",
    )
  ).rows[0];
  return { deleted, pending: Number(remaining.count) };
}
export const artifactRouter = express.Router();
artifactRouter.get("/runs/:id/artifacts", async (req, res) => {
  res.json({ artifacts: await listArtifacts(String(req.params.id)) });
});
artifactRouter.delete("/runs/:id/artifacts/:artifactId", async (req, res) => {
  if (res.locals.auth?.workspace?.role !== "owner")
    return res
      .status(403)
      .json({ error: "Workspace owner access is required" });
  if (
    !(await deleteArtifact(
      String(req.params.id),
      String(req.params.artifactId),
    ))
  )
    return res.status(404).json({ error: "Artifact not found" });
  res.status(204).end();
});
artifactRouter.get("/runs/:id/artifacts/:artifactId", async (req, res) => {
  const row = (
    await db.query(
      "SELECT * FROM artifacts WHERE id=$1 AND run_id=$2 AND redacted_at IS NULL AND expires_at>now()",
      [req.params.artifactId, req.params.id],
    )
  ).rows[0];
  if (!row) return res.status(404).json({ error: "Artifact not found" });
  let data: Buffer;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(row.iv, "base64"),
    );
    decipher.setAAD(
      Buffer.from(`${row.id}:${row.run_id}:${row.provider_execution_id}`),
    );
    decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
    data = Buffer.concat([
      decipher.update(await readFile(artifactPath(row.id))),
      decipher.final(),
    ]);
    if (
      data.length !== row.byte_length ||
      createHash("sha256").update(data).digest("hex") !== row.sha256
    )
      throw new Error("Artifact integrity mismatch");
  } catch {
    return res
      .status(503)
      .json({ error: "Recording is temporarily unavailable" });
  }
  res.setHeader("Content-Type", row.content_type);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Disposition", `inline; filename="${row.id}.audio"`);
  const range = req.headers.range;
  if (!range) {
    res.setHeader("Content-Length", data.length);
    Readable.from(data).pipe(res);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2]))
    return res.status(416).set("Content-Range", `bytes */${data.length}`).end();
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, data.length - Number(match[2]));
  const end =
    match[1] && match[2]
      ? Math.min(Number(match[2]), data.length - 1)
      : data.length - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= data.length ||
    end < start
  )
    return res.status(416).set("Content-Range", `bytes */${data.length}`).end();
  res.status(206).set({
    "Content-Range": `bytes ${start}-${end}/${data.length}`,
    "Content-Length": String(end - start + 1),
  });
  Readable.from(data.subarray(start, end + 1)).pipe(res);
});
