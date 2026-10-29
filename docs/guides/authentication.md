# Authentication and workspace isolation

The real-data workspace uses server sessions and PostgreSQL workspace isolation. Configure authentication privately before exposing the service. Supabase supplies PostgreSQL storage while Vouch owns its application sessions. Supabase publishable keys and browser authentication are not substitutes for this server configuration.

## Server settings

| Variable                    | Meaning                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `VOUCH_AUTH_MODE`           | Use `session` for the authenticated workspace              |
| `PUBLIC_ORIGIN`             | Exact browser origin without a trailing slash or path      |
| `VOUCH_BOOTSTRAP_EMAIL`     | Initial owner email for an empty user database             |
| `VOUCH_BOOTSTRAP_PASSWORD`  | Private initial password with at least fourteen characters |
| `VOUCH_BOOTSTRAP_WORKSPACE` | Optional initial workspace name                            |
| `VOUCH_SESSION_HOURS`       | Absolute lifetime from 1 to 168 hours with a default of 12 |
| `VOUCH_COOKIE_SECURE`       | Use `true` for HTTPS development outside production        |

Production requires session mode and an HTTPS origin. Production cookies are always Secure. The application must not be exposed using a password-free development configuration. No automatic workspace data, campaign statistics or fake calls are created for onboarding.

Preserve the ignored environment file and generate only missing private signing and recording keys.

```sh
test -e .env || (umask 077; cp .env.example .env)
chmod 600 .env
pnpm setup:secrets
```

Fill actual database and owner values privately. Placeholders intentionally cannot establish a connection. Follow [Supabase PostgreSQL](../operations/supabase.md), then apply migrations and start the services.

```sh
pnpm db:migrate
pnpm dev
```

## First owner

Bootstrap creates the first owner once under a database advisory lock. Restarts do not overwrite existing users. Sign in, rotate the initial password and remove the bootstrap password from the runtime environment. Keep recovery access in an approved operator process.

Passwords use per-user random salts and scrypt. Plaintext passwords are not stored. Password rotation requires the current password and revokes all sessions for that user. Provisioning a new member does not require an email service.

## Session behavior

Sign-in creates a random opaque token. Only its SHA-256 digest is stored in PostgreSQL. The browser cookie is HttpOnly and SameSite Strict with a Secure flag on HTTPS. Production uses the `__Host-` prefix without a Domain attribute.

Sessions expire after the configured absolute lifetime. Logout revokes the stored token and clears the cookie. Workspace membership is checked on each request. Removing a member revokes their sessions using that workspace.

Every session-authenticated mutation needs the trusted `Origin` and session-derived `X-Vouch-CSRF` header. Login validates the origin before accepting credentials. Machine evidence callbacks use their separate per-run HMAC authentication rather than browser cookies or CSRF tokens.

Failed login attempts are rate-limited by the application. Multiple API replicas also need an upstream shared rate limiter. Configure trusted proxies explicitly instead of accepting arbitrary forwarded address headers.

## Workspace membership

A signed-in user can create a workspace and switch between existing memberships. The selected workspace belongs to the server session. A client-supplied tenant header cannot replace it.

Owners may list, provision and remove members. Adding an existing user does not overwrite their password. Deliver a new user's initial password privately and require rotation. Final-owner removal is rejected. Ordinary members cannot perform owner-only membership, connector-credential or privacy actions.

## Database permissions

The [versioned SQL migrations](../../apps/api/src/database/migrations/) establish schema, restricted runtime permissions and forced row-level security. The migration connection can be supplied separately using `DATABASE_MIGRATION_URL`. Runtime queries use `DATABASE_URL`. If the runtime login differs from the migrator, set `DATABASE_RUNTIME_ROLE` to the actual PostgreSQL username so migrations can grant the restricted role correctly. Supabase session-pooler project suffixes are not part of that underlying PostgreSQL role name.

Use a Supabase direct connection or session pooler on port 5432 rather than transaction pooling on port 6543. Remote connections verify server certificates. `DATABASE_SSL_CA_FILE` can provide a trusted PEM CA file when needed. Disabling verification or using a permissive TLS mode is rejected.

The migrator must own the Vouch tables and have the required schema permissions. Creating the restricted role requires `CREATEROLE` when the role does not already exist. The migrator must be able to grant `vouch_runtime` membership to the actual runtime PostgreSQL role. This does not inherently require a PostgreSQL superuser. Supabase database administration privileges must be checked for the selected project.

Normal tenant queries assume the restricted runtime role inside a short transaction and set a transaction-local workspace. Forced row-level security protects targets, campaigns, runs and related evidence. Composite foreign keys prevent cross-workspace parent references. A missing workspace context cannot expose tenant rows.

Authentication, worker and maintenance operations use explicit trusted system context. This is internal server authority rather than a permission available to product users. A PostgreSQL service credential must remain server-only and does not belong in browser code.

## HTTP contract

| Method      | Route                        | Behavior                                                           |
| ----------- | ---------------------------- | ------------------------------------------------------------------ |
| GET         | `/api/auth/session`          | Read authentication state, memberships, current workspace and CSRF |
| POST        | `/api/auth/login`            | Sign in with email and password                                    |
| POST        | `/api/auth/logout`           | Revoke session and clear cookie                                    |
| POST        | `/api/auth/workspace`        | Switch to an existing membership                                   |
| POST        | `/api/auth/workspaces`       | Create and select a workspace                                      |
| GET or POST | `/api/auth/members`          | Owner-only listing or provisioning                                 |
| DELETE      | `/api/auth/members/{userId}` | Owner-only removal with final-owner protection                     |
| POST        | `/api/auth/password`         | Rotate password and revoke all user sessions                       |

Before sign-in, the session endpoint returns HTTP 200 with `authenticated=false`. Product data reads require authentication. Unknown or other-workspace identifiers return HTTP 404. An authentication or database placeholder is not a completed sign-in test.

## Remaining integration boundaries

Enterprise SSO, password-reset email, email invitations and identity-provider federation are separate integrations. Actual remote database access, deployed cookies, owner bootstrap and cross-workspace behavior require checks against the configured environment. Record those results without equating a local build to production acceptance.
