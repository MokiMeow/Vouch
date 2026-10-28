import "dotenv/config";
import pg from "pg";
export const db = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://vouch:vouch-local-only@127.0.0.1:54329/vouch",
  max: 8,
});
db.on("error", () =>
  console.error(
    "PostgreSQL connection interrupted; subsequent operations will reconnect.",
  ),
);
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const value = await fn(c);
    await c.query("COMMIT");
    return value;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
