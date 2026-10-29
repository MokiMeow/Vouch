import { createHash } from "node:crypto";
import pg from "pg";
import {
  createDatabasePool,
  configureDatabaseClient,
  withSystemDatabase,
} from "./database/client";
import {
  listMigrationFiles,
  readMigrationSql,
} from "./database/migration-source";

type AppliedMigration = { version: number; name: string; checksum: string };
type MigrationOptions = { databaseUrl?: string; runtimeRole?: string };
const digest = (sql: string) =>
  createHash("sha256").update(sql, "utf8").digest("hex");
const ownedTables = [
  "targets",
  "campaigns",
  "runs",
  "events",
  "accounts",
  "reviews",
  "live_executions",
  "evidence_streams",
  "evidence_receipts",
  "provider_evidence_cursors",
  "artifacts",
  "vouch_users",
  "vouch_sessions",
  "vouch_workspaces",
  "vouch_memberships",
  "vouch_schema_migrations",
  "service_heartbeats",
];

async function preflight(client: pg.PoolClient) {
  const role = (
    await client.query<{
      rolsuper: boolean;
      rolcreaterole: boolean;
      schema_create: boolean;
      schema_usage: boolean;
      schema_grant: boolean;
      runtime_exists: boolean;
      runtime_member: boolean;
    }>(`
    SELECT r.rolsuper,r.rolcreaterole,
      has_schema_privilege(current_user,'public','CREATE') AS schema_create,
      has_schema_privilege(current_user,'public','USAGE') AS schema_usage,
      has_schema_privilege(current_user,'public','USAGE WITH GRANT OPTION') AS schema_grant,
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vouch_runtime') AS runtime_exists,
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vouch_runtime' AND pg_has_role(current_user,oid,'MEMBER')) AS runtime_member
    FROM pg_roles r WHERE r.rolname=current_user`)
  ).rows[0];
  if (
    !role ||
    !role.schema_create ||
    !role.schema_usage ||
    (!role.rolsuper && !role.schema_grant)
  )
    throw new Error(
      "Database migrations require CREATE and USAGE on the public schema plus permission to grant schema USAGE. Use the Supabase project database owner or an explicitly provisioned migration role",
    );
  if (!role.runtime_exists && !role.rolsuper && !role.rolcreaterole)
    throw new Error(
      "The migration role needs CREATEROLE to provision the restricted vouch_runtime role. Ask the database owner to precreate that NOLOGIN NOINHERIT NOBYPASSRLS role and grant membership to the migration role",
    );
  if (
    role.runtime_exists &&
    !role.runtime_member &&
    !role.rolsuper &&
    !role.rolcreaterole
  )
    throw new Error(
      "The migration role must be a member or administrator of vouch_runtime before migrations can grant runtime access",
    );
  const foreign = (
    await client.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind IN ('r','p')
    AND NOT pg_has_role(current_user,c.relowner,'USAGE') LIMIT 1`,
      [ownedTables],
    )
  ).rows[0];
  if (foreign && !role.rolsuper)
    throw new Error(
      "Existing Vouch tables belong to another database role. Use their owner for DATABASE_MIGRATION_URL or grant ownership through an authorized database administrator; retained data must not be reset",
    );
}
async function inMigrationTransaction<T>(
  client: pg.PoolClient,
  fn: () => Promise<T>,
) {
  await client.query("BEGIN");
  try {
    await configureDatabaseClient(client);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
function runtimePrincipal(explicit?: string) {
  if (explicit ?? process.env.DATABASE_RUNTIME_ROLE)
    return explicit ?? process.env.DATABASE_RUNTIME_ROLE;
  const value = process.env.DATABASE_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    const name = decodeURIComponent(url.username);
    if (/[\[\]<>]/.test(name) || /YOUR_|PLACEHOLDER/i.test(name)) return null;
    return url.hostname.endsWith(".pooler.supabase.com") && name.includes(".")
      ? name.slice(0, name.lastIndexOf("."))
      : name;
  } catch {
    return null;
  }
}
async function grantRuntimePrincipal(
  client: pg.PoolClient,
  name: string | null | undefined,
) {
  if (!name) return;
  if (!/^[a-zA-Z_][a-zA-Z0-9_.-]{0,62}$/.test(name))
    throw new Error(
      "DATABASE_RUNTIME_ROLE must be an actual PostgreSQL role name, without a pooler project suffix",
    );
  const role = (
    await client.query<{ rolcanlogin: boolean }>(
      "SELECT rolcanlogin FROM pg_roles WHERE rolname=$1",
      [name],
    )
  ).rows[0];
  if (
    !role ||
    !role.rolcanlogin ||
    ["anon", "authenticated", "service_role", "vouch_runtime"].includes(name)
  )
    throw new Error(
      "DATABASE_RUNTIME_ROLE must identify the actual private PostgreSQL login role, not a public API or restricted group role",
    );
  const member = (
    await client.query(
      "SELECT pg_has_role($1,'vouch_runtime','MEMBER') AS member",
      [name],
    )
  ).rows[0].member;
  if (!member)
    await client.query(
      `GRANT vouch_runtime TO "${name.replaceAll('"', '""')}"`,
    );
  const identifier = '"' + name.replaceAll('"', '""') + '"';
  await client.query(`GRANT USAGE ON SCHEMA public TO ${identifier}`);
  const available = (
    await client.query<{ relname: string }>(
      "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind IN ('r','p')",
      [ownedTables.filter((table) => table !== "vouch_schema_migrations")],
    )
  ).rows;
  if (available.length)
    await client.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ${available.map((row) => '"' + row.relname.replaceAll('"', '""') + '"').join(",")} TO ${identifier}`,
    );
  await client.query(
    `GRANT SELECT ON vouch_schema_migrations TO ${identifier}`,
  );
}

/** Applies immutable SQL files through a direct or session-pooled DDL connection. */
export async function migrate(options: MigrationOptions = {}) {
  const value =
    options.databaseUrl ??
    (process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL);
  const pool = createDatabasePool(value, "migration");
  let client: pg.PoolClient | undefined;
  let locked = false;
  let currentFile = "connection preflight";
  try {
    client = await pool.connect();
    const connection = client;
    await connection.query("SET search_path=public");
    await connection.query("SELECT pg_advisory_lock(864211)");
    locked = true;
    await preflight(connection);
    const files = await listMigrationFiles();
    const sources = await Promise.all(
      files.map(async (name) => ({
        name,
        version: Number(name.slice(0, 3)),
        sql: await readMigrationSql(name),
      })),
    );
    await withSystemDatabase(async () => {
      const ledger = (
        await connection.query(
          "SELECT to_regclass('public.vouch_schema_migrations') AS ledger",
        )
      ).rows[0].ledger;
      if (!ledger) {
        const first = sources[0];
        currentFile = first.name;
        await inMigrationTransaction(connection, async () => {
          await connection.query(first.sql);
          await connection.query(
            "INSERT INTO vouch_schema_migrations(version,name,checksum) VALUES($1,$2,$3)",
            [first.version, first.name, digest(first.sql)],
          );
        });
      }
      const applied = (
        await connection.query<AppliedMigration>(
          "SELECT version,name,checksum FROM vouch_schema_migrations ORDER BY version",
        )
      ).rows;
      if (applied.some((entry, index) => entry.version !== index))
        throw new Error(
          "Applied database migration history has a gap. Restore the migration ledger from a consistent backup instead of applying files out of order",
        );
      for (const entry of applied) {
        const source = sources.find((item) => item.version === entry.version);
        if (
          !source ||
          source.name !== entry.name ||
          digest(source.sql) !== entry.checksum
        )
          throw new Error(
            "Applied database migration checksum or filename differs from this checkout. Restore the exact applied SQL and add a new numbered migration rather than editing history",
          );
      }
      for (const source of sources) {
        if (applied.some((entry) => entry.version === source.version)) continue;
        currentFile = source.name;
        await inMigrationTransaction(connection, async () => {
          await connection.query(source.sql);
          await connection.query(
            "INSERT INTO vouch_schema_migrations(version,name,checksum) VALUES($1,$2,$3)",
            [source.version, source.name, digest(source.sql)],
          );
        });
      }
      currentFile = "runtime role grants";
      await inMigrationTransaction(connection, () =>
        grantRuntimePrincipal(
          connection,
          runtimePrincipal(options.runtimeRole),
        ),
      );
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const code = String(error.code);
      if (code === "42501")
        throw new Error(
          "Migration permission denied. Use a schema/table owner with permission to create and grant the restricted runtime role; Supabase does not require a superuser",
        );
      if (/CERT|TLS|SSL/.test(code))
        throw new Error(
          "Database TLS verification failed. Configure a trusted project CA with DATABASE_SSL_CA_FILE; do not disable certificate verification",
        );
      if (code === "28P01" || code === "28000")
        throw new Error(
          "Database migration authentication failed. Configure the project database credentials in DATABASE_MIGRATION_URL; no credential values are logged",
        );
      throw new Error(
        `Database migration failed during ${currentFile} with code ${/^[A-Z0-9_]+$/.test(code) ? code : "DATABASE_ERROR"}. Any active migration transaction was rolled back; inspect trusted database logs without sharing credentials`,
      );
    }
    throw error;
  } finally {
    if (client) {
      if (locked)
        await client
          .query("SELECT pg_advisory_unlock(864211)")
          .catch(() => undefined);
      client.release();
    }
    await pool.end();
  }
}
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    await migrate();
    console.log("Database migrations complete");
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Database migration failed",
    );
    process.exitCode = 1;
  }
}
