import { readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db, withSystemDatabase } from "../database/client";
import { pathToFileURL } from "node:url";
import { get } from "node:http";

const heartbeatFile = () =>
  process.env.VOUCH_WORKER_HEARTBEAT_FILE ?? "/tmp/vouch-worker-heartbeat";
const workerInstanceId = randomUUID();
const maximumHeartbeatAge = 120000;
export type WorkerHealth = {
  state: "ready" | "unavailable" | "not_checked";
  detail: string;
};
export type WorkerHeartbeatObservation = {
  state: string;
  checked_at: Date | string;
  last_success_at: Date | string | null;
  age_ms?: number | string;
};
export function classifyWorkerHealth(
  row: WorkerHeartbeatObservation | undefined,
  now = Date.now(),
): WorkerHealth {
  if (!row)
    return {
      state: "unavailable",
      detail:
        "No worker heartbeat has been recorded. Start the campaign worker",
    };
  const checked = new Date(row.checked_at).getTime();
  const succeeded =
    row.last_success_at === null
      ? NaN
      : new Date(row.last_success_at).getTime();
  const age = row.age_ms === undefined ? now - checked : Number(row.age_ms);
  if (row.state !== "healthy")
    return {
      state: "unavailable",
      detail:
        "The worker is stopped or its last database tick failed. Check its configuration and restart it after correcting the issue",
    };
  if (
    !Number.isFinite(checked) ||
    !Number.isFinite(succeeded) ||
    succeeded !== checked ||
    !Number.isFinite(age) ||
    age < -5000 ||
    age > maximumHeartbeatAge
  )
    return {
      state: "unavailable",
      detail:
        "The worker has no recent successful database tick. Check that the campaign worker is running",
    };
  return {
    state: "ready",
    detail:
      "A worker recently completed a successful database tick. This does not verify provider connectivity or a live call",
  };
}
export async function readWorkerHealth(
  instanceId?: string,
): Promise<WorkerHealth> {
  const result = await db.query<WorkerHeartbeatObservation>(
    `SELECT state,checked_at,last_success_at,
      EXTRACT(EPOCH FROM(clock_timestamp()-checked_at))*1000 AS age_ms
     FROM service_heartbeats WHERE service='worker' AND ($1::uuid IS NULL OR instance_id=$1)
     ORDER BY (state='healthy' AND last_success_at=checked_at
       AND checked_at BETWEEN clock_timestamp()-interval '120 seconds' AND clock_timestamp()+interval '5 seconds') DESC,
       checked_at DESC LIMIT 1`,
    [instanceId ?? null],
  );
  return classifyWorkerHealth(result.rows[0]);
}
export async function workerHeartbeat(state: "healthy" | "failed" = "healthy") {
  const result = await withSystemDatabase(() =>
    db.query<{ checked_at: Date }>(
      `INSERT INTO service_heartbeats(service,instance_id,state,checked_at,last_success_at)
     VALUES('worker',$1,$2,now(),CASE WHEN $2='healthy' THEN now() ELSE NULL END)
     ON CONFLICT(service,instance_id) DO UPDATE SET state=EXCLUDED.state,checked_at=EXCLUDED.checked_at,
       last_success_at=CASE WHEN EXCLUDED.state='healthy' THEN EXCLUDED.checked_at ELSE service_heartbeats.last_success_at END
     RETURNING checked_at`,
      [workerInstanceId, state],
    ),
  );
  const temporary = `${heartbeatFile()}.${workerInstanceId}.tmp`;
  await writeFile(
    temporary,
    JSON.stringify({
      instanceId: workerInstanceId,
      state,
      checkedAt: result.rows[0].checked_at.toISOString(),
    }),
    { mode: 0o600 },
  );
  await rename(temporary, heartbeatFile());
}
export async function assertWorkerHealthy() {
  const mirror: unknown = JSON.parse(await readFile(heartbeatFile(), "utf8"));
  if (
    !mirror ||
    typeof mirror !== "object" ||
    !("instanceId" in mirror) ||
    typeof mirror.instanceId !== "string" ||
    !("state" in mirror) ||
    mirror.state !== "healthy"
  )
    throw new Error("Worker heartbeat is missing or failed");
  const instanceId = mirror.instanceId;
  if (
    (await withSystemDatabase(() => readWorkerHealth(instanceId))).state !==
    "ready"
  )
    throw new Error("Worker heartbeat is missing or stale");
}

export async function assertApiHealthy() {
  const host = process.env.PUBLIC_ORIGIN
    ? new URL(process.env.PUBLIC_ORIGIN).host
    : "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    const request = get(
      {
        hostname: "127.0.0.1",
        port: Number(process.env.PORT ?? 4000),
        path: "/api/health",
        headers: { Host: host },
        timeout: 4000,
      },
      (response) => {
        let body = "";
        response.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
          if (body.length > 4096)
            request.destroy(new Error("Invalid health response"));
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            const result: unknown = JSON.parse(body);
            if (
              response.statusCode !== 200 ||
              !result ||
              typeof result !== "object" ||
              !("status" in result) ||
              result.status !== "ok"
            )
              throw new Error("API is not ready");
            resolve();
          } catch {
            reject(new Error("API is not ready"));
          }
        });
      },
    );
    request.on("timeout", () =>
      request.destroy(new Error("API health check timed out")),
    );
    request.on("error", reject);
  });
}

type OperationFields = {
  runId?: string;
  workspaceId?: string;
  status?: string;
  count?: number;
  deletedCampaigns?: number;
  deletedRuns?: number;
  deletedSessions?: number;
  durationMs?: number;
  dryRun?: boolean;
};
export function operationLog(
  event: "startup" | "shutdown" | "maintenance" | "worker_failure",
  fields: OperationFields = {},
) {
  console.log(
    JSON.stringify({ at: new Date().toISOString(), event, ...fields }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    if (process.argv[2] === "worker-health") await assertWorkerHealthy();
    else if (process.argv[2] === "api-health") await assertApiHealthy();
    else throw new Error("Unknown health command");
  } catch {
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
