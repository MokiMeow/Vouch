import type { PoolClient } from "pg";
import { z } from "zod";
import {
  assertScope,
  scenarios,
  scopeSchema,
  type Scope,
  type Verdict,
} from "../../../packages/core/src/index";
import { db, withSystemDatabase } from "./db";
import {
  advanceLive,
  cleanupProvisionedCallers,
  liveTransaction,
} from "./live";
import { workerHeartbeat } from "./operations";
import { executeFixture } from "./fixture";
import {
  assertConfigurationHash,
  canonicalJson,
  currentPolicySchema,
} from "./configuration";
type Job = {
  id: string;
  campaign_id: string;
  scenario: string;
  synthetic: boolean;
  scope: Scope;
  config: unknown;
  config_hash: string;
  config_hash_algorithm: string;
  campaign_status: string;
};
const configSchema = z.object({
  mode: z.literal("fixture"),
  policy: currentPolicySchema,
  scope: scopeSchema,
  runtime: z.object({
    provider: z.literal("vouch-fixture"),
    apiFlavor: z.literal("fixture-v1"),
    model: z.literal(scenarios.false_authority.model),
  }),
  scenarios: z.record(z.string(), z.record(z.string(), z.unknown())),
});
function isScenario(name: string): name is keyof typeof scenarios {
  return Object.hasOwn(scenarios, name);
}
function validateConfiguration(job: Job) {
  assertConfigurationHash(
    job.config,
    job.config_hash,
    job.config_hash_algorithm,
  );
  if (!isScenario(job.scenario))
    throw new Error("The captured scenario is not supported by this runtime");
  const parsed = configSchema.safeParse(job.config);
  if (!parsed.success)
    throw new Error(
      "The captured fixture configuration is incompatible with this runtime",
    );
  if (canonicalJson(parsed.data.scope) !== canonicalJson(job.scope))
    throw new Error("The captured scope no longer matches this campaign");
  const captured = parsed.data.scenarios[job.scenario];
  if (!captured) throw new Error("The captured scenario is missing");
  if (
    Object.entries(scenarios[job.scenario]).some(
      ([key, value]) => captured[key] !== value,
    )
  )
    throw new Error(
      "The captured scenario has changed; a new authorized campaign is required",
    );
}
async function finishCampaign(c: PoolClient, job: Job, verdict: Verdict) {
  if (verdict.outcome === "violation" && job.scope.stopOnFinding) {
    await c.query("UPDATE campaigns SET status='stopped' WHERE id=$1", [
      job.campaign_id,
    ]);
    await c.query(
      "UPDATE runs SET status='cancelled',finished_at=now() WHERE campaign_id=$1 AND status='queued'",
      [job.campaign_id],
    );
    return;
  }
  await c.query(
    "UPDATE campaigns SET status=CASE WHEN EXISTS(SELECT 1 FROM runs WHERE campaign_id=$1 AND status='failed') THEN 'failed' WHEN EXISTS(SELECT 1 FROM runs WHERE campaign_id=$1 AND status='queued') THEN 'running' ELSE 'completed' END WHERE id=$1",
    [job.campaign_id],
  );
}
async function processJob(c: PoolClient, job: Job) {
  // Roll back a failed call before writing its failure record. SQL errors otherwise
  // leave PostgreSQL in an aborted transaction, causing the same job to retry forever.
  await c.query("SAVEPOINT call_execution");
  try {
    const scope = scopeSchema.parse(job.scope);
    assertScope(scope, Date.now(), 0);
    if (!job.synthetic)
      throw new Error(
        "Live calls blocked: hard duration, cost reservation and cancellation capabilities are not verified",
      );
    validateConfiguration(job);
    await c.query(
      "UPDATE runs SET status='running',started_at=now() WHERE id=$1",
      [job.id],
    );
    const verdict = await executeFixture(c, job);
    await c.query(
      "UPDATE runs SET status='completed',verdict=$2,finished_at=now() WHERE id=$1",
      [job.id, verdict],
    );
    await finishCampaign(c, job, verdict);
    await c.query("RELEASE SAVEPOINT call_execution");
  } catch (error) {
    await c.query("ROLLBACK TO SAVEPOINT call_execution");
    await c.query("RELEASE SAVEPOINT call_execution");
    await c.query(
      "UPDATE runs SET status='failed',error=$2,finished_at=now() WHERE id=$1",
      [job.id, error instanceof Error ? error.message : "Worker failed"],
    );
    await c.query("UPDATE campaigns SET status='failed' WHERE id=$1", [
      job.campaign_id,
    ]);
  }
}
let callerCleanupTask: Promise<void> | null = null;
function scheduleCallerCleanup() {
  if (callerCleanupTask) return;
  callerCleanupTask = withSystemDatabase(async () => {
    const cleanupClient = await db.connect();
    try {
      await cleanupProvisionedCallers(cleanupClient);
    } finally {
      cleanupClient.release();
    }
  })
    .catch(() => {
      console.error(
        "Isolated caller cleanup deferred after a provider or database interruption",
      );
    })
    .finally(() => {
      callerCleanupTask = null;
    });
}
export async function tick() {
  return withSystemDatabase(async () => {
    const c = await db.connect();
    let locked = false;
    try {
      // A session lock spans short transactions and bounded provider requests.
      // No SQL transaction is held open while the provider is contacted.
      locked = (await c.query("SELECT pg_try_advisory_lock(864209) AS locked"))
        .rows[0].locked;
      if (!locked) return false;
      if (await advanceLive(c)) return true;
      return liveTransaction(c, async () => {
        const { rows } = await c.query<Job>(
          `SELECT r.*,c.scope,c.config_hash,c.config_hash_algorithm,c.status AS campaign_status
           FROM runs r JOIN campaigns c ON c.id=r.campaign_id
           WHERE r.status='queued' AND r.synthetic
             AND CASE WHEN pg_input_is_valid(c.scope->>'startsAt','timestamptz')
               THEN (c.scope->>'startsAt')::timestamptz<=now() ELSE true END
           ORDER BY r.created_at,r.scenario LIMIT 1 FOR UPDATE OF r,c SKIP LOCKED`,
        );
        const job = rows[0];
        if (!job) return false;
        if (job.campaign_status === "stopped") {
          await c.query(
            "UPDATE runs SET status='cancelled',finished_at=now() WHERE id=$1",
            [job.id],
          );
          return true;
        }
        await processJob(c, job);
        return true;
      });
    } finally {
      try {
        if (locked) {
          await c.query("SELECT pg_advisory_unlock(864209)");
          // Run deletion independently so even a single worker keeps polling
          // active calls while provider cleanup is unavailable or slow.
          scheduleCallerCleanup();
        }
      } finally {
        c.release();
      }
    }
  });
}
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  console.log("Vouch worker ready (PostgreSQL queue, concurrency 1)");
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      console.error(
        "Worker database operation failed",
        error instanceof Error ? error.message : "unknown",
      );
    }
    await workerHeartbeat();
    await new Promise((r) => setTimeout(r, 500));
  }
  await callerCleanupTask;
  await db.end();
}
