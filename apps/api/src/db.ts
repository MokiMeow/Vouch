import "dotenv/config";
import pg from "pg";
const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error(
    "DATABASE_URL is required. Configure it in the server environment or ignored .env file.",
  );
export const db = new pg.Pool({
  connectionString,
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
