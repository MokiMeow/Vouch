import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error(
    "DATABASE_URL is required in the server environment or ignored .env file.",
  );

const pool = new pg.Pool({
  connectionString,
  max: 8,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});
pool.on("error", () =>
  console.error(
    "PostgreSQL connection interrupted; subsequent operations will reconnect.",
  ),
);
type DatabaseContext = { system: true } | { workspaceId: string };
const context = new AsyncLocalStorage<DatabaseContext>();

export function withSystemDatabase<T>(fn: () => T): T {
  return context.run({ system: true }, fn);
}
export function withWorkspaceDatabase<T>(workspaceId: string, fn: () => T): T {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      workspaceId,
    )
  )
    throw new Error("A valid workspace is required");
  return context.run({ workspaceId }, fn);
}
export function currentWorkspaceId(): string | null {
  const value = context.getStore();
  return value && "workspaceId" in value ? value.workspaceId : null;
}

// Call only after BEGIN. SET LOCAL settings and role disappear on COMMIT/ROLLBACK.
export async function configureDatabaseClient(client: pg.PoolClient) {
  const value = context.getStore();
  if (value && "system" in value) {
    await client.query(
      "SELECT set_config('vouch.system','on',true),set_config('vouch.workspace_id','',true)",
    );
    return;
  }
  await client.query("SET LOCAL ROLE vouch_runtime");
  await client.query(
    "SELECT set_config('vouch.system','off',true),set_config('vouch.workspace_id',$1,true)",
    [currentWorkspaceId() ?? ""],
  );
}

export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await configureDatabaseClient(client);
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Expose raw connections for worker advisory locks. Their transactions must call
// configureDatabaseClient; ordinary request reads/writes always use query/transaction.
export const db = {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>> {
    return transaction((client) => client.query<R>(text, values));
  },
  connect: () => pool.connect(),
  end: () => pool.end(),
};
