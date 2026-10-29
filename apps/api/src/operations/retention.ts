import { db, transaction } from "../database/client";
import { purgeRunArtifacts } from "../evidence/artifacts";

const closedCampaign = `c.mode='live'
  AND NOT EXISTS(SELECT 1 FROM runs legacy WHERE legacy.campaign_id=c.id AND legacy.synthetic)
  AND c.status IN ('completed','failed','stopped')
  AND c.created_at<now()-($1::int*interval '1 day')
  AND NOT EXISTS (
    SELECT 1 FROM runs r WHERE r.campaign_id=c.id AND (
      r.status NOT IN ('completed','failed','cancelled')
      OR r.finished_at IS NULL
      OR r.finished_at>=now()-($1::int*interval '1 day')
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM live_executions e JOIN runs r ON r.id=e.run_id
    WHERE r.campaign_id=c.id AND (
      e.state NOT IN ('completed','failed','cancelled') OR e.settled_cents IS NULL
      OR e.cleanup_state IN ('lookup_required','pending','retry','deleting')
      OR (e.caller_agent_id IS NOT NULL AND e.cleanup_state <> 'deleted')
    )
  )`;

function retentionDays() {
  const raw = process.env.VOUCH_RUN_RETENTION_DAYS;
  if (raw === undefined || raw === "") return null;
  const days = Number(raw);
  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(days) ||
    days < 1 ||
    days > 3650
  )
    throw new Error("VOUCH_RUN_RETENTION_DAYS must be between 1 and 3650");
  return days;
}

// Caller must provide system database context. Preserve unresolved work even when
// it is older than the retention cutoff; age is never dispatch reconciliation.
export async function purgeClosedCampaigns(
  options: { dryRun?: boolean; limit?: number } = {},
) {
  const days = retentionDays();
  if (days === null)
    return { enabled: false, deletedCampaigns: 0, deletedRuns: 0, pending: 0 };
  const limit = options.limit ?? 10;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25)
    throw new Error("Invalid campaign retention batch limit");
  const candidates = await db.query<{ id: string }>(
    `SELECT c.id FROM campaigns c WHERE ${closedCampaign} ORDER BY c.created_at LIMIT $2`,
    [days, limit],
  );
  if (options.dryRun)
    return {
      enabled: true,
      deletedCampaigns: 0,
      deletedRuns: 0,
      pending: candidates.rows.length,
    };
  let deletedCampaigns = 0;
  let deletedRuns = 0;
  for (const candidate of candidates.rows) {
    const deleted = await transaction(async (client) => {
      const locked = await client.query(
        `SELECT c.id FROM campaigns c WHERE c.id=$2 AND ${closedCampaign} FOR UPDATE OF c SKIP LOCKED`,
        [days, candidate.id],
      );
      if (!locked.rows.length) return null;
      const runs = await client.query<{ id: string }>(
        "SELECT id FROM runs WHERE campaign_id=$1 FOR UPDATE",
        [candidate.id],
      );
      const ids = runs.rows.map((run) => run.id);
      // File deletion precedes metadata removal. If either step fails, retain the
      // campaign for a later retry rather than orphaning encrypted recordings.
      await purgeRunArtifacts(ids, { client });
      await client.query("DELETE FROM reviews WHERE run_id=ANY($1::uuid[])", [
        ids,
      ]);
      await client.query("DELETE FROM events WHERE run_id=ANY($1::uuid[])", [
        ids,
      ]);
      // Per-run provider/evidence tables have ON DELETE CASCADE foreign keys.
      await client.query("DELETE FROM runs WHERE campaign_id=$1", [
        candidate.id,
      ]);
      await client.query("DELETE FROM campaigns WHERE id=$1", [candidate.id]);
      return ids.length;
    });
    if (deleted !== null) {
      deletedCampaigns++;
      deletedRuns += deleted;
    }
  }
  const remaining = await db.query<{ count: string }>(
    `SELECT count(*) AS count FROM campaigns c WHERE ${closedCampaign}`,
    [days],
  );
  return {
    enabled: true,
    deletedCampaigns,
    deletedRuns,
    pending: Number(remaining.rows[0].count),
  };
}
