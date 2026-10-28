import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { get } from "node:http";

const heartbeatFile = () =>
  process.env.VOUCH_WORKER_HEARTBEAT_FILE ?? "/tmp/vouch-worker-heartbeat";

export async function workerHeartbeat() {
  await writeFile(heartbeatFile(), String(Date.now()), { mode: 0o600 });
}

export async function assertWorkerHealthy() {
  const lastTick = Number(await readFile(heartbeatFile(), "utf8"));
  const age = Date.now() - lastTick;
  if (!Number.isFinite(lastTick) || age < -5000 || age > 120_000)
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
  }
}
