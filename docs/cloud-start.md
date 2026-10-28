# Cloud startup

Use the existing `/workspace/Vouch` checkout. Every task is already isolated; do not create a worktree unless the user explicitly requests one. Preserve user edits. Never write secrets into repository files or print their values.

1. Activate the writable package-manager home:
   ```sh
   export PNPM_HOME=/workspace/.pnpm
   export PATH="$PNPM_HOME:$PATH"
   cd /workspace/Vouch
   ```
2. Verify the managed local Docker socket. Do not replace inherited proxy/CA settings or start a second daemon:
   ```sh
   env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock info
   ```
3. Set `DATABASE_URL` through the server environment or ignored `.env`; application code has no credential fallback. Run `pnpm setup:secrets` to generate only missing signing/encryption keys privately. If `.env` is absent, copy `.env.example` with `umask 077` before starting the default local fixture services. Preserve any existing `.env`. `bash scripts/db-start.sh` starts or recreates the development PostgreSQL container using retained `.data/postgres`. Run `pnpm db:migrate` if schema setup is needed. It is idempotent.
4. Dependencies and `dist/web` are retained filesystem outputs. If missing or after lockfile changes, run `pnpm install --frozen-lockfile --store-dir /workspace/.pnpm-store` and `pnpm build`. Only esbuild's approved build script may run.
5. Start the API and worker in separate managed terminal sessions: `pnpm dev:api` and `pnpm dev:worker`. For frontend development also run `pnpm dev:web`; otherwise the API serves the built interface. Check existing listeners before starting duplicates.
6. Request the API's `/api/health` on loopback port 4000; expect `status: ok` and `database: postgresql`. A port alone does not prove readiness. Confirm `/api/overview` returns targets/campaigns and the worker logs readiness.
7. Run a fixture campaign or existing checks when validating changes. `pnpm test` is unit coverage. `pnpm test:integration` uses an isolated test database; `pnpm test:browser` creates explicitly synthetic fixture records in the development database and requires the API/worker and Chromium.

No provider credentials are required for fixtures. Apply migrations before using the expanded application so the restricted database role and workspace policies exist. All fixture actions use fictional accounts; no real call is made. Live dispatch defaults to disabled. The provider, Twilio and signed-evidence code is implemented, but actual account controls require operator acceptance and all readiness settings from `docs/bolna.md`. Inspect names/presence only when checking credentials.

Docker containers, application processes, and runtime credential readiness are not assumed to survive a new task. Recreate services from retained data as above. Publication and fresh-task restoration have not been validated by this setup. Do not create user-facing localhost preview links from onboarding.
