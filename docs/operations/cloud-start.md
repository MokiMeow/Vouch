# Cloud startup

Use the existing checkout and preserve user changes and retained data. Normal startup does not populate test records or call a provider.

1. Run `bash /path/to/checkout/scripts/cloud-install.sh` from any directory. The script resolves its own checkout, preserves `.env`, installs pinned dependencies and builds. Placeholder-only configuration skips database migration with a clear message.
2. In a managed shell with a restricted home directory, activate the checkout-local package-manager home before subsequent manual pnpm commands. Run `export PNPM_HOME="$PWD/.cache/pnpm"` and `export PATH="$PNPM_HOME:$PATH"` from the checkout. The install script does this for its own process.
3. Configure actual Supabase `DATABASE_URL` and optionally `DATABASE_MIGRATION_URL` through private environment settings when available. See [Supabase setup](supabase.md) for verified TLS, session pooling and required migrator role privileges. Never print connection strings or credential values.
4. Run `pnpm db:migrate` before using a configured database. The checksummed SQL files ship in the production output. No business targets, conversations or findings are seeded.
5. Run `pnpm start:api` and `pnpm start:worker` in separate supervised sessions after checking existing listeners. For frontend development use `pnpm dev`. With no database connection, the API can serve its local setup page but the worker must wait for actual configuration.
6. Generate signing/encryption keys with `pnpm setup:secrets` only when preparing evidence capture. Fill provider, carrier, recording-host, target authorization and billing placeholders before explicitly enabling live calls. Credentials alone do not bypass readiness gates.
7. `/api/health` and `/api/ready` return unavailable until the required database is ready. A running port is not proof that Supabase or a provider is connected.
8. `pnpm test` runs unit checks. `pnpm test:integration` uses an isolated temporary Docker PostgreSQL database. `pnpm test:browser` serves the actual built UI and intercepts records inside the test process. Neither suite modifies retained development or customer data or places calls.

Docker is required for isolated database tests and optional container deployment. It is not required to connect to hosted Supabase. Verify the managed Docker daemon through the platform socket before container work; do not start a competing daemon or disable proxy/TLS protection. No user-facing localhost preview is created by this setup.

Runtime processes, database connectivity and restored artifacts are not assumed to survive a new task. Recreate processes from preserved data and configuration. Configuration drafts, Git pushes and public website publication are separate operations. Hosted deployment, remote migration and real-call acceptance remain pending actual credentials.
