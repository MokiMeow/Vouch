# Authentication and workspace isolation

Vouch supports a local fixture workspace and authenticated multi-workspace sessions. These modes share the product API but use different entry requirements. The authentication and database context implementation is in `apps/api/src/auth.ts` and `apps/api/src/db.ts`.

## Local fixture mode

Nonproduction loopback development defaults to `VOUCH_AUTH_MODE=local`. This mode exposes a single local workspace without a password. Explicit local mode is rejected when `NODE_ENV=production` or when the API binds outside `127.0.0.1` and `localhost`.

Local mode is for fictional fixture data in a trusted development environment. It does not provide identity-based access control. It still uses the workspace database context and row-level isolation, which prevents accidental access to data belonging to an authenticated workspace.

## Session mode

Set these server environment variables through the deployment secret mechanism or ignored local `.env`.

| Variable                    | Meaning                                                  |
| --------------------------- | -------------------------------------------------------- |
| `VOUCH_AUTH_MODE`           | Set to `session` to require sign-in                      |
| `PUBLIC_ORIGIN`             | Exact public origin without a trailing slash or path     |
| `VOUCH_BOOTSTRAP_EMAIL`     | Initial owner email for an empty user database           |
| `VOUCH_BOOTSTRAP_PASSWORD`  | Initial owner password with at least fourteen characters |
| `VOUCH_BOOTSTRAP_WORKSPACE` | Optional initial workspace name                          |
| `VOUCH_SESSION_HOURS`       | Session duration from one to 168 hours, default twelve   |
| `VOUCH_COOKIE_SECURE`       | Set to `true` when using HTTPS outside production        |

Production requires session mode and an HTTPS `PUBLIC_ORIGIN`. Production cookies are always secure, regardless of a false cookie setting. The server refuses incomplete first-owner configuration instead of silently starting an unauthenticated service.

Bootstrap creates the first owner once under a database advisory lock. Subsequent restarts do not reset credentials or overwrite existing users. Remove the initial bootstrap password from the deployment environment after the first successful sign-in and password rotation. Keep the account's password in an appropriate password manager.

Passwords use per-user random salts and scrypt with N 32768, r 8, p 1 and a 64-byte derived key. Password comparisons use constant-time comparison. Plaintext passwords are not stored. Password changes require the current password and revoke all existing sessions for that user.

## Session behavior

Sign-in creates a random 32-byte opaque token. Only its SHA-256 digest is stored in PostgreSQL. The browser receives an HttpOnly, SameSite Strict cookie scoped to `/`, with a Secure flag on HTTPS deployments. Secure production cookies use the `__Host-` prefix and do not set a Domain attribute.

Sessions expire after the configured absolute duration. Logout deletes the stored token digest and clears the cookie. Workspace access is rechecked against current membership on every request, so removing a member invalidates their access without waiting for session expiry.

Every session-authenticated mutation requires both a trusted `Origin` and the `X-Vouch-CSRF` header returned by the session endpoint. The CSRF value is derived from the opaque session token and is never used as a bearer credential. A legitimate command-line client must send its configured origin, session cookie and CSRF header. Login validates origin before accepting credentials. Failed sign-in attempts are rate-limited in memory by source address and normalized email, with a bounded map.

When running several API replicas, use an upstream shared rate limiter in addition to the per-process application limit. Configure trusted proxy handling explicitly rather than trusting arbitrary forwarded address headers.

## Workspace membership

A signed-in user can create another workspace and switch between their memberships. The current workspace is stored with the session rather than trusted from an arbitrary request header.

Workspace owners can list and provision members, including another owner. Adding an existing user grants membership without changing that user's password. A new user requires a password of at least fourteen characters. Deliver initial credentials through an approved private channel, then have the user rotate their password.

Removing a membership revokes sessions currently using that workspace. The final workspace owner cannot be removed. Ordinary members can use permitted product workflows but cannot administer memberships or perform owner-protected operational actions.

## Database enforcement

Tenant data is scoped at the database boundary rather than only filtered in route handlers.

- `AsyncLocalStorage` carries the authorized workspace through asynchronous request handling.
- Every ordinary database query runs in a short transaction, sets the workspace with transaction-local settings and assumes the restricted `vouch_runtime` role.
- The runtime role cannot log in, create databases or roles, become a superuser or bypass row-level security.
- Targets, campaigns, runs and live execution records have direct workspace policies. Event, account, review, evidence and artifact records inherit ownership through their run.
- Forced PostgreSQL row-level security applies to reads and writes. Composite target/campaign/run foreign keys prevent cross-workspace parent references.
- Authentication tables are unavailable to the ordinary runtime role. The authentication module accesses them under an explicit system context after performing identity and membership checks.

A query without a workspace context cannot read tenant records. Worker and maintenance operations must explicitly use `withSystemDatabase`. Worker transactions obtained from a raw pool connection must call `configureDatabaseClient` after `BEGIN`. Transaction-local settings disappear on commit or rollback and cannot bleed into a later pool request.

Migrations require a database principal that can create or manage the restricted role and grant it to the application principal. Production should keep database credentials server-only. Restrict database network access to application and maintenance services. The system database context is trusted server code and is not a permission exposed to end users.

## HTTP contract

| Method | Path                         | Behavior                                                                               |
| ------ | ---------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/api/auth/session`          | Return mode, authentication state, user, current workspace, memberships and CSRF value |
| POST   | `/api/auth/login`            | Accept email and password, set session cookie and return session state                 |
| POST   | `/api/auth/logout`           | Revoke session and clear cookie                                                        |
| POST   | `/api/auth/workspace`        | Select an existing membership using `workspaceId`                                      |
| POST   | `/api/auth/workspaces`       | Create a workspace using `name` and switch to it                                       |
| GET    | `/api/auth/members`          | Owner-only workspace member list                                                       |
| POST   | `/api/auth/members`          | Owner-only member provisioning with email, optional name/password and role             |
| DELETE | `/api/auth/members/{userId}` | Owner-only member removal with final-owner protection                                  |
| POST   | `/api/auth/password`         | Accept currentPassword and newPassword, rotate password and revoke sessions            |

Before sign-in, the session endpoint returns HTTP 200 with `authenticated=false`. Product data routes return HTTP 401 until sign-in. Unknown or other-workspace run reads return HTTP 404 because inaccessible rows are absent from the authorized database view.

## Delivery boundary

The implementation includes local credentials, server sessions and workspace isolation. Enterprise SSO, password reset email delivery, email invitations and identity-provider federation are separate integrations. Provisioning and password rotation work without an email service. End-user and live-call testing remains with the project owner as requested.

Remove the bootstrap password from the runtime environment after the first owner exists. Existing installations do not need it for normal startup. Rotate the initial password through the account controls and retain recovery access through your approved operator process.
