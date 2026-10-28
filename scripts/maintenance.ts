import "dotenv/config";
import { db, withSystemDatabase } from "../apps/api/src/database/client";
import { purgeExpiredArtifacts } from "../apps/api/src/evidence/artifacts";
import { purgeExpiredSessions } from "../apps/api/src/auth/service";
import { purgeClosedCampaigns } from "../apps/api/src/operations/retention";
import { operationLog } from "../apps/api/src/operations/health";

const arguments_ = new Set(process.argv.slice(2));
if ([...arguments_].some((item) => !["--dry-run", "--apply"].includes(item)))
  throw new Error("Use --dry-run or --apply for maintenance");
if (arguments_.has("--dry-run") && arguments_.has("--apply"))
  throw new Error("Choose one maintenance mode");
const dryRun = !arguments_.has("--apply");
const started = Date.now();
try {
  const results = await withSystemDatabase(async () => {
    const artifacts = await purgeExpiredArtifacts({ dryRun, limit: 100 });
    const campaigns = await purgeClosedCampaigns({ dryRun, limit: 10 });
    const sessions = dryRun ? 0 : await purgeExpiredSessions();
    return { artifacts, campaigns, sessions };
  });
  operationLog("maintenance", {
    dryRun,
    count: results.artifacts.deleted,
    deletedCampaigns: results.campaigns.deletedCampaigns,
    deletedRuns: results.campaigns.deletedRuns,
    deletedSessions: results.sessions,
    status:
      results.artifacts.pending + results.campaigns.pending > 0
        ? "remaining_batches"
        : "complete",
    durationMs: Date.now() - started,
  });
} catch {
  operationLog("maintenance", {
    dryRun,
    status: "failed",
    durationMs: Date.now() - started,
  });
  process.exitCode = 1;
} finally {
  await db.end();
}
