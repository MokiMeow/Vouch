import { db, withSystemDatabase } from "./database/client";
import { advanceLive, cleanupProvisionedCallers } from "./execution/live";
import { workerHeartbeat } from "./operations/health";

let callerCleanupTask: Promise<void> | null = null;
let nextCallerCleanupAt = 0;
function scheduleCallerCleanup() {
  if (callerCleanupTask || Date.now() < nextCallerCleanupAt) return;
  nextCallerCleanupAt = Date.now() + 30000;
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
      // Only genuine provider-backed runs are eligible for execution. Legacy
      // synthetic rows remain archived and are never replayed.
      return await advanceLive(c);
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
  console.log(
    "Vouch worker ready (provider-backed calls, PostgreSQL queue, concurrency 1)",
  );
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  while (!stopping) {
    let active = false;
    try {
      active = await tick();
    } catch (error) {
      console.error(
        "Worker database operation failed",
        error instanceof Error ? error.message : "unknown",
      );
    }
    await workerHeartbeat();
    await new Promise((r) => setTimeout(r, active ? 500 : 2500));
  }
  await callerCleanupTask;
  await db.end();
}
