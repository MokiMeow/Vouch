# Supabase PostgreSQL setup

Vouch uses Supabase as its PostgreSQL database backend. The Node API and worker connect through PostgreSQL directly. The browser continues to use Vouch's authenticated API and does not receive a Supabase database password, service-role key or database URL.

No Supabase project or credential has been supplied or connected by this implementation. The checked-in configuration contains placeholders. These instructions describe the required setup without claiming a remote deployment or successful connection.

## Choose a session-capable connection

Use the Supabase project dashboard's Connect panel and obtain either the direct PostgreSQL connection or the Supavisor session-pooler connection. Both normally use port 5432.

| Connection                      | Use                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Direct database on port 5432    | API, worker and migrations when the execution environment can reach the project's address family              |
| Session pooler on port 5432     | API, worker and migrations when a session-capable pooled connection is preferred, including IPv4 environments |
| Transaction pooler on port 6543 | Unsupported                                                                                                   |

The worker holds a PostgreSQL session advisory lock across several short transactions and provider requests. Transaction pooling can move those transactions between backend sessions and cannot preserve that lock. The application rejects port 6543, `pgbouncer=true` and an explicit transaction-pool mode rather than silently losing cross-worker concurrency protection.

Use an exact database origin supplied by your own Supabase project. A direct hostname generally follows `db.YOUR_PROJECT_REF.supabase.co`. A session-pooler hostname generally follows `aws-YOUR_REGION.pooler.supabase.com`, with the project suffix attached to the login username. Copy the actual dashboard values instead of inventing a project reference or region.

## Configure server-only settings

| Setting                  | Purpose                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`           | Runtime direct or session-pooler connection                                                                        |
| `DATABASE_MIGRATION_URL` | Optional separate direct or session-pooler DDL connection; an empty setting falls back to DATABASE_URL             |
| `DATABASE_RUNTIME_ROLE`  | Optional actual PostgreSQL role receiving membership in vouch_runtime when migration and runtime principals differ |
| `DATABASE_SSL_CA_FILE`   | Optional readable PEM file containing the trusted database CA certificate                                          |

Example placeholders show the format only.

```dotenv
DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_DATABASE_PASSWORD@aws-YOUR_REGION.pooler.supabase.com:5432/postgres?sslmode=verify-full
DATABASE_MIGRATION_URL=postgresql://postgres:YOUR_DATABASE_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=verify-full
DATABASE_RUNTIME_ROLE=
DATABASE_SSL_CA_FILE=
```

Percent-encode special characters in the username and password. Put real values only in the ignored private `.env` or the deployment secret manager. Keep `.env` at mode 0600. Placeholder strings are rejected locally before a connection is attempted. No credential value is included in validation errors.

For the pooler's `postgres.YOUR_PROJECT_REF` login form, the actual database role is normally `postgres`. The runner removes the pooler project suffix when deriving a runtime grant. Set `DATABASE_RUNTIME_ROLE` explicitly when your deployment uses a custom role whose actual PostgreSQL name differs from its connection login.

When both URLs use the same project owner, no additional runtime-role setting is needed. For separate principals, provision the runtime role first and let the migration owner grant its membership in the restricted role. Do not use the restricted `vouch_runtime` role as a login user because it intentionally has NOLOGIN.

## Keep TLS verification enabled

All nonloopback PostgreSQL connections use TLS with certificate and hostname verification. The application never sets `rejectUnauthorized=false`. Node's trusted CA set is used unless `DATABASE_SSL_CA_FILE` supplies the project's trusted CA certificate. Existing process-wide trusted CA configuration remains available when no explicit CA file is selected.

Obtain a certificate only through the authenticated Supabase project settings or another independently trusted distribution channel. Store it as a private deployment configuration file and point the CA setting to that file. If verification fails, fix the trust configuration rather than disabling verification.

Remote URLs may omit `sslmode` or use `verify-full`. `verify-ca` is accepted but still receives hostname verification. Modes such as `require`, `prefer` and `disable` are rejected remotely because those names can lead clients to omit certificate verification. URL certificate-path settings are rejected to prevent a URL from overriding the server's verified TLS object. Other driver query settings should be configured through server code rather than embedded in the URL.

Only loopback test/development databases may omit TLS. A Docker service hostname such as `postgres` is not considered loopback. The application does not treat a private-network hostname as permission to disable certificate checks.

PostgreSQL uses TCP rather than the HTTP proxy. A managed cloud environment needs a supported TCP network grant or VPN route to the selected database host and port. An HTTP-domain allowance alone does not establish PostgreSQL connectivity. No network-policy bypass is implemented.

## Provision migration privileges

The project database owner is usually the simplest migration principal. A restricted dedicated migration user is also supported when an administrator grants the necessary privileges.

- CREATE and USAGE on the public schema, with permission to grant schema USAGE
- Ownership of existing Vouch tables, or membership in their owning role
- CREATEROLE when `vouch_runtime` does not exist yet
- Permission to grant membership in `vouch_runtime` when a separate runtime principal is configured

A PostgreSQL superuser is not required. Supabase's managed PostgreSQL service should not be configured to provide one. If organizational policy disallows CREATEROLE for migrations, an authorized database administrator can precreate `vouch_runtime` with NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE and NOBYPASSRLS, then grant the appropriate memberships. Do not grant the restricted role membership in another role.

The migration preflight checks schema access, role-management capability and existing table ownership before schema changes. Permission errors identify the required setup without logging the connection URL, password or provider response body. Existing customer data is never reset to work around ownership or connection errors.

## Apply versioned migrations

After configuring the actual credentials and network access, run from the checkout.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pnpm dev
```

The migration entry point uses `DATABASE_MIGRATION_URL` when set, otherwise `DATABASE_URL`. A separate one-connection pool holds the migration advisory lock for the session. Every migration file executes inside a transaction with a ledger update in that same transaction.

SQL lives under `apps/api/src/database/migrations`.

| File               | Responsibility                                                                     |
| ------------------ | ---------------------------------------------------------------------------------- |
| `000_ledger.sql`   | Migration history with immutable SHA-256 digests                                   |
| `001_base.sql`     | Targets, campaigns, runs, normalized events and reviews                            |
| `002_live.sql`     | Provider execution state, reservations and caller cleanup                          |
| `003_evidence.sql` | Signed evidence streams, receipts, privacy markers and encrypted-artifact metadata |
| `004_auth.sql`     | Users, sessions, workspaces, restricted role, row-level policies and access grants |
| `005_indexes.sql`  | Workspace history and run/review lookup indexes                                    |

The runner verifies the name and digest of every applied migration before applying newer versions. SQL line endings are normalized to LF before SHA-256 hashing so a Windows checkout does not invalidate an unchanged migration. A changed historical file, missing source version or gap in the recorded history stops migration. Restore the exact original file and add a new numbered migration when schema behavior needs to change.

If a file fails, its DDL and ledger record roll back together. Previously completed migration versions remain applied. Rerunning continues from the next unapplied version. A session advisory lock prevents two application migration runners from changing the schema at the same time.

The compiled server build must copy the SQL directory beside the emitted database module. Native ESM migration loading resolves SQL relative to the module rather than assuming the shell's working directory. Never deploy only the JavaScript entry point without its migration assets.

## Real records and existing data

A fresh database contains schema and initial workspace metadata, not targets, campaigns, runs, mock conversations or fictional account rows. The public application registers approved PSTN targets and creates live campaigns from actual submitted settings. There is no fixture account table in the fresh migration.

For an existing checkout, CREATE IF NOT EXISTS preserves retained tables and records. Historical fixture account tables and synthetic rows are not destroyed by migration. The real-data application excludes those archived records from normal workflows. Data deletion or archive disposal requires a separate deliberate retention action.

Supabase's anonymous and authenticated HTTP Data API roles are not Vouch's authorization system. Migrations revoke Vouch table privileges from PUBLIC and the Supabase anon, authenticated and service_role roles when present. The browser must use Vouch sessions and the Node API. Do not expose these tables by adding permissive PostgREST policies or broad grants.

## Authentication and isolation

Set session authentication and the exact HTTPS public origin for production. Initial owner bootstrap needs a real email and a strong private password. See the [authentication guide](../guides/authentication.md) for the exact settings and user-management workflow.

Workspace requests enter a restricted database role and transaction-local workspace context. Forced row-level policies apply to reads and writes, with account/run evidence inheriting ownership from its run. Worker and maintenance code use an explicit system context. The migration login and application credentials stay server-side.

A dedicated application database login can reduce privileges further after setup. The migration runner grants that private login membership in `vouch_runtime`, direct server-side table access for session administration and system-context worker/maintenance operations, and read-only migration-history access. Normal workspace transactions still assume the restricted role, which cannot access authentication tables. The login must be an actual PostgreSQL LOGIN role and cannot be a Supabase public API role. Do not replace it with a public or anonymous key.

## Troubleshooting

A placeholder error means the actual project connection settings have not been configured. A pooler error means the selected endpoint cannot preserve sessions. A TLS error means the CA chain or hostname must be corrected. A role or ownership error means the migration principal lacks the required database privileges.

For timeouts, verify the Supabase project is active and the execution environment has TCP reachability to the exact host on port 5432. Direct database IPv6 and session-pooler IPv4 availability differ. Choose the supported project endpoint for the environment rather than guessing another hostname.

For migration-history errors, restore source files and the database ledger from matching backups. Do not edit or remove ledger rows to make a changed migration appear valid. The deployment and restore runbooks should retain encrypted recordings and database state consistently while keeping credentials and encryption keys separately protected.
