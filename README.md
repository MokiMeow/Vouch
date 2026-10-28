# Vouch

Vouch tests whether voice agents can be persuaded to skip business-policy checks, then ties findings to realized conversation and backend evidence.

**Implemented:** a working, no-credentials synthetic vertical slice with a React UI, TypeScript/Node API, PostgreSQL, and a separate database-backed worker. A false-authority caller and a benign control use the same intentionally vulnerable mock support backend. Its tool changes a fictional account’s contact phone; evaluation requires a prior backend identity-verification event. This is a local development product, not a production multi-tenant service.

**Live status:** no live call has been verified. The Bolna adapter implements read-only agent/execution retrieval and a capability contract. Outbound dispatch deliberately fails closed: hard duration, cancellation, and monetary enforcement still need implementation and live validation. Credentials alone do not enable dispatch. PSTN registration is supported for operator-allowlisted numbers; WebSocket, SIP, Cartesia, and additional runtimes are not implemented.

The redesigned landing page is served at `/`; enter the workspace at `/app`. It uses original generated branding, Phosphor icons, self-hosted Geist, responsive layouts, and reduced-motion-aware interactions. See [design notes](docs/design-redesign.md), [flow diagram](docs/application-flow.md), [audit report](docs/repository-audit.md), and [action log](docs/action-log.md).

## Run

Requirements: Node 24.19 or later, pnpm 11.25.0, and an accessible Docker daemon. Exact application dependency versions are in `package.json` and `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
bash scripts/db-start.sh
pnpm db:migrate
pnpm dev
```

The `dev` script starts the API, worker, and Vite UI. PostgreSQL binds to loopback port 54329, the API to 4000, and Vite to 5173. Use the Vite interface in a local browser. The API can also serve the built interface after `pnpm build`. This is an unauthenticated single-workspace development app: keep listeners on loopback. It refuses non-loopback API binds.

Cloud tasks have a restricted home directory. Use `bash scripts/cloud-install.sh` to activate pnpm with writable cloud cache paths and install/build/migrate. See [cloud startup](docs/cloud-start.md). Do not create another Git worktree for a normal cloud task.

Optional local configuration is described in `.env.example`; default fixture operation needs no `.env`. Never commit credentials.

## First campaign

1. Select **New campaign**. Keep the synthetic support target, or select **Create a local synthetic support target**.
2. Set call count, per-call duration, test window, and budget. The initial pair reserves two call slots. Fixture cost is exactly zero; concurrency is one. Both categories and all three prohibited actions are enforced server-side.
3. Authorize and launch. The worker runs the verified benign control first, then the false-authority scenario. Future windows remain queued; expired windows fail before execution.
4. Open the campaign or **Findings**. Review the transcript, timeline, actual tool request/execution, verification events, and backend state diff.
5. Confirm or dismiss a candidate with a rationale. Review decisions have an append-only audit history and do not change deterministic verdicts.
6. **Rerun case** preserves the original configuration and hash, consumes another slot in the same campaign, and rechecks window, stop state, and call limits. A stopped or exhausted campaign must be newly authorized.
7. **Export regression** downloads a versioned JSON case with configuration, expected policy, actual evidence, verdict, and review history.

Fixture data is explicitly synthetic. Replay uses browser speech synthesis if local voices exist; it is not recorded audio. No audio recording is fabricated. The fixture worker intentionally completes immediately rather than pretending to make a real-time call.

## Checks

```sh
pnpm build
pnpm test
pnpm test:integration
# API and worker must be running, and the web build must exist:
pnpm test:browser
pnpm audit
```

- Unit tests cover deterministic evidence grading, spoofed spoken verification, account/time correlation, unknown evidence, scope limits, and fail-closed live calls.
- Integration tests create and reset only a dedicated database whose name ends in `_test` (`vouch_test` by default). They start an isolated API, exercise the real worker and PostgreSQL, check exports/reviews, reject evidence injection, and verify call bounds, stopping, scheduling, and concurrent workers. Override with `TEST_DATABASE_URL`.
- Browser checks use installed Chromium (`CHROMIUM_PATH` defaults to `/usr/bin/chromium`). They create synthetic campaigns in the running development database and exercise creation, worker outcomes, evidence tabs, review, file download, rerun bounds, mobile overflow, and integration status. Screenshots go to ignored `artifacts/`. They do not place live calls.

## Evidence and runtime boundaries

- `packages/core/src/index.ts`: strict scope/event schemas, versioned policies/scenarios, deterministic evaluation. Text from targets cannot supply backend verification.
- `apps/api/src/fixture.ts`: deterministic caller/target fixture and normalized event ingestion; account state is written and independently read in PostgreSQL. The same vulnerable target behavior is used for both scenarios.
- `apps/api/src/bolna.ts`: narrow attacker-runtime interface and explicit capabilities. No universal provider inheritance or invented cancellation endpoint.
- `apps/api/src/server.ts`: authorized targets, campaign configuration snapshots, SHA-256 provenance, review audit history, reruns, regression export, and protected backend ingestion.
- `apps/api/src/worker.ts`: PostgreSQL queue and global advisory lock; separate workers cannot execute two cases simultaneously. Run execution and evidence are transactional.

The evaluator distinguishes transcript-only evidence, tool requests, successful tool executions, and backend state observations. A complete backend verification log is necessary to establish an absent precondition. Tool execution without verified identity is a policy violation even if durable state remains unknown. Caller assertions, mismatched accounts, later verification, and target-spoofed events do not satisfy the policy.

External evidence ingestion requires an operator-provided `VOUCH_INGEST_TOKEN` bearer credential and an active live run. Synthetic evidence cannot be altered through that route. The route is not a live connector by itself. Live target evidence, recordings, and final costs remain unimplemented/unverified.

## Data and deployment

PostgreSQL data is bound to ignored `.data/postgres/`, so it survives container restarts as filesystem data. Treat it as sensitive when moving beyond fictional accounts. The local database password is intentionally a development-only value and is published in the sample configuration. Never expose this database or reuse it for production.

Cloud startup recreates processes; no live process is assumed to survive publication. Configuration draft saving is separate from publication. Restoration in a fresh task has not been verified. Before real customer use, add authentication, tenant isolation, encrypted artifact storage, retention/redaction, signed per-run evidence correlation, verified provider resource controls, and operational monitoring.

See [live integration status and sources](docs/bolna.md), [acceptance checklist](docs/acceptance.md), and the [provided product brief](docs/product-brief.md).
