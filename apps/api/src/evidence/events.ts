import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  eventSchema,
  type EvidenceEvent,
} from "../../../../packages/core/src/index";

export async function appendEvent(
  c: PoolClient,
  runId: string,
  e: Omit<EvidenceEvent, "seq">,
) {
  const parsed = eventSchema.parse({
    kind: e.kind,
    at: e.at,
    source: e.source,
    data: e.data,
  });
  // The run lock serializes all writers, including the external ingestion route.
  await c.query("SELECT id FROM runs WHERE id=$1 FOR UPDATE", [runId]);
  const { rows } = await c.query(
    "SELECT COALESCE(MAX(seq),0)+1 AS seq FROM events WHERE run_id=$1",
    [runId],
  );
  const event = { ...parsed, id: randomUUID(), seq: Number(rows[0].seq) };
  await c.query(
    "INSERT INTO events(id,run_id,seq,kind,source,at,data) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      event.id,
      runId,
      event.seq,
      event.kind,
      event.source,
      event.at,
      event.data,
    ],
  );
  return event;
}
