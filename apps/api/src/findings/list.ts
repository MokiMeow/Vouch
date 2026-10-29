import { z } from "zod";
import { db } from "../database/client";
import { runTitles } from "../../../../packages/core/src/presentation";

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const findingsQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().max(300).default(""),
  outcome: z.enum(["all", "violation", "pass", "unknown"]).default("all"),
});
export async function listFindings(query: unknown) {
  const input = findingsQuerySchema.parse(query);
  // Escape LIKE metacharacters so a search is always literal user text.
  const pattern = `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
  const values = [
    pattern,
    input.outcome,
    runTitles.control,
    runTitles.violation,
    runTitles.attempt,
    runTitles.controlPending,
  ];
  const where = `NOT r.synthetic AND c.mode='live'
    AND ($2='all' OR r.verdict->>'outcome'=$2)
    AND lower(concat_ws(' ',c.name,t.name,r.scenario,replace(r.scenario,'_',' '),
      CASE WHEN r.verdict->>'outcome'='violation' THEN r.review ELSE '' END,
      r.verdict->>'outcome',r.status,
      CASE WHEN r.scenario='benign_control' AND r.verdict->>'outcome'='pass' THEN $3 WHEN r.scenario='benign_control' THEN $6 WHEN r.verdict->>'outcome'='violation' THEN $4 ELSE $5 END)) LIKE lower($1) ESCAPE '\\'`;
  const result = (
    await db.query(
      `WITH matching AS MATERIALIZED (
    SELECT r.id,r.campaign_id,r.scenario,r.status,r.synthetic,r.verdict,r.review,r.created_at,c.name AS campaign_name,t.name AS target_name
    FROM runs r JOIN campaigns c ON c.id=r.campaign_id JOIN targets t ON t.id=c.target_id WHERE ${where}
  ), page AS (SELECT * FROM matching ORDER BY created_at DESC,id DESC LIMIT $7 OFFSET $8)
  SELECT (SELECT count(*)::int FROM matching) AS total,
    COALESCE((SELECT jsonb_agg(page ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb) AS runs`,
      [...values, input.limit, input.offset],
    )
  ).rows[0];
  return {
    runs: result.runs,
    pagination: {
      limit: input.limit,
      offset: input.offset,
      totalRuns: result.total,
      hasMore: input.offset + result.runs.length < result.total,
    },
  };
}
