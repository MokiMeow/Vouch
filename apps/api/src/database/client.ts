import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import pg from "pg";

export type DatabasePurpose = "runtime" | "migration";
export class DatabaseConfigurationError extends Error {
  readonly status = 503;
  constructor(message = "Database configuration is incomplete") {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
const placeholder =
  /(?:\[[A-Z_ ]+\]|<[^>]+>|YOUR_(?:PASSWORD|PROJECT|DATABASE|REGION)|REPLACE_(?:ME|THIS)|CHANGE_ME|PLACEHOLDER)/i;
function hasConnectionFields(url: URL) {
  return (
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    [url.hostname, url.username, url.password].every(Boolean) &&
    url.pathname.length > 1 &&
    !url.hash
  );
}
function configuredDatabaseUrl(value: string | undefined, label: string) {
  try {
    if (!value || placeholder.test(decodeURIComponent(value)))
      throw new DatabaseConfigurationError();
    const url = new URL(value);
    if (!hasConnectionFields(url)) throw new DatabaseConfigurationError();
    return url;
  } catch {
    throw new DatabaseConfigurationError(
      `${label} must contain a configured PostgreSQL connection URL rather than a placeholder`,
    );
  }
}
function assertSessionConnection(url: URL) {
  if (
    url.port === "6543" ||
    url.searchParams.get("pgbouncer") === "true" ||
    url.searchParams.get("pool_mode") === "transaction"
  )
    throw new DatabaseConfigurationError(
      "Transaction pooling is unsupported because Vouch workers require session advisory locks. Use a Supabase direct connection or session pooler on port 5432",
    );
  if ([...url.searchParams.keys()].some((key) => key !== "sslmode"))
    throw new DatabaseConfigurationError(
      "PostgreSQL connection URLs support only the sslmode query setting. Configure pool and TLS settings on the server instead of embedding driver options in the URL",
    );
}
function assertVerifiedTls(local: boolean, mode: string | null) {
  if (!local && mode && !["verify-full", "verify-ca"].includes(mode))
    throw new DatabaseConfigurationError(
      "Remote PostgreSQL connections require verified TLS. Use sslmode=verify-full or omit sslmode; insecure require, prefer and disable modes are not accepted",
    );
}
function databaseCa(): string | undefined {
  if (!process.env.DATABASE_SSL_CA_FILE) return;
  let ca: string;
  try {
    ca = readFileSync(process.env.DATABASE_SSL_CA_FILE, "utf8");
  } catch {
    throw new DatabaseConfigurationError(
      "DATABASE_SSL_CA_FILE must point to a readable trusted PostgreSQL CA certificate",
    );
  }
  if (!ca.includes("-----BEGIN CERTIFICATE-----"))
    throw new DatabaseConfigurationError(
      "DATABASE_SSL_CA_FILE must contain PEM certificate data",
    );
  return ca;
}
function connectionTls(url: URL): pg.PoolConfig["ssl"] {
  const local = loopbackHosts.has(url.hostname);
  const mode = url.searchParams.get("sslmode");
  assertVerifiedTls(local, mode);
  const ca = databaseCa();
  // node-postgres URL SSL options otherwise replace the verified TLS object.
  url.searchParams.delete("sslmode");
  const verifyTls = !local || !!ca || (mode !== null && mode !== "disable");
  return verifyTls
    ? {
        rejectUnauthorized: true,
        ...(ca ? { ca } : {}),
        ...(local ? {} : { servername: url.hostname }),
      }
    : false;
}
export function databaseConnectionConfig(
  value: string | undefined,
  options: { purpose?: DatabasePurpose } = {},
): pg.PoolConfig {
  const purpose = options.purpose ?? "runtime";
  const label =
    purpose === "migration"
      ? "DATABASE_MIGRATION_URL or DATABASE_URL"
      : "DATABASE_URL";
  const url = configuredDatabaseUrl(value, label);
  assertSessionConnection(url);
  const ssl = connectionTls(url);
  return {
    connectionString: url.toString(),
    ssl,
    max: purpose === "migration" ? 1 : 8,
    connectionTimeoutMillis: 10000,
    statement_timeout: purpose === "migration" ? 60000 : 10000,
    application_name:
      purpose === "migration" ? "vouch-migrate" : "vouch-runtime",
  };
}
export function createDatabasePool(
  value: string | undefined,
  purpose: DatabasePurpose = "runtime",
) {
  const pool = new pg.Pool(databaseConnectionConfig(value, { purpose }));
  pool.on("error", () =>
    console.error(
      "PostgreSQL connection interrupted; subsequent operations will reconnect.",
    ),
  );
  return pool;
}
let runtimePool: pg.Pool | undefined;
function pool() {
  return (runtimePool ??= createDatabasePool(process.env.DATABASE_URL));
}

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
// Call only after BEGIN. SET LOCAL settings and role disappear at transaction end.
export async function configureDatabaseClient(client: pg.PoolClient) {
  // A separate migration/runtime login may have a different default schema.
  // pg_catalog remains implicitly first for built-in function resolution.
  await client.query("SET LOCAL search_path=public");
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
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await configureDatabaseClient(client);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export const db = {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>> {
    return transaction((client) => client.query<R>(text, values));
  },
  // Raw worker connections must use configureDatabaseClient after BEGIN.
  connect: () => pool().connect(),
  end: async () => {
    if (runtimePool) {
      const closing = runtimePool;
      runtimePool = undefined;
      await closing.end();
    }
  },
};
