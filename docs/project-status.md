# Vouch current status

Updated on October 29, 2026.

The website now uses the selected cool-white and electric-blue direction with original ice-current background imagery. Retired mascot assets and simulated product flows have been removed. Supabase PostgreSQL is the default backend, with placeholder-only configuration until actual credentials are supplied.

Overall completion is approximately 90 percent as a qualitative project estimate. The requested implementation and isolated checks are complete; hosted configuration, provider acceptance and operational recovery still need actual credentials. This estimate is not a test-coverage measure or production-readiness certification.

## Real data boundary

- Product reads and workers exclude historical simulated records.
- There is no production demo seed, local fixture caller, invented transcript, browser speech substitute or fabricated dashboard count.
- Missing database configuration produces a setup state. Missing call evidence stays unavailable or unknown.
- The v1 caller still uses the explicitly authorized isolated test account and challenge. These are controlled inputs to a real call, not generated observations.
- Tests use isolated records inside temporary databases or browser interception only. They do not populate the website or contact providers.

## Desktop report fixes

Global findings search now matches visible titles and actual outcomes across the workspace. Blank search is empty, literal wildcard characters stay literal, and pagination counts conversations. Page, search and filters persist in the URL, including reload and Back. Modals close on navigation, and action errors cannot leak into another page.

Campaign rows provide one native primary link and a separate labelled Stop action. Passed controls do not display Pending decisions. Rerun controls reflect stop state, remaining slots, run status and the authorized window, with server enforcement preserved. Exports require recorded call evidence. Field messages name the invalid field, and API/form windows agree on 1–1440 minutes.

The new visual system also fixes Docs focus treatment, removes crowded mascot art and keeps the background out of dense evidence content. See [the report follow-up](reports/desktop-followup.md).

## Supabase and setup

Versioned SQL lives in `apps/api/src/database/migrations/` and is copied into the native server build. The runner checks ownership/role privileges, serializes migration and verifies applied checksums. It supports separate runtime/migration credentials and verified TLS. Direct or session pooling is required because workers use session advisory locks.

The private environment and committed examples contain no usable credentials. Hosted database credentials, caller/carrier configuration, recipient authorization, recording hosts and billing confirmations remain to be provided. Signing/encryption keys can be generated privately when preparing actual evidence capture.

The cloud install script was executed successfully from `/tmp`, with writable package-manager storage inside the checkout. It completed install/build without touching a database and explicitly skipped migrations while placeholders were empty. Compose uses configured Supabase by default; optional local PostgreSQL is behind the `local-db` profile.

## Verification completed

| Check                       | Result                   | Scope                                                                                                              |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Unit checks                 | 79 passed                | Evidence, scope, configuration, URL state, field messages and Supabase connection validation                       |
| PostgreSQL/API regressions  | 113 passed               | Fresh/repeated/checksummed SQL, RLS, global search, pagination, validation, export/rerun guards, sessions and CSRF |
| Browser regressions         | Passed                   | 71 browser-only records, navigation/history/modals, search, controls, stale errors and 320–2560px layouts          |
| Public Docs                 | Passed                   | All seven routes, search states, clipboard, focus ring and separate-tab navigation                                 |
| Accessibility               | 16 scans passed          | Desktop/mobile product test states and actual placeholder-only landing/workspace/quickstart pages                  |
| Production build            | Passed                   | Strict TypeScript, Vite and native Node output including SQL files                                                 |
| Production dependency audit | No known vulnerabilities | Installed production dependencies                                                                                  |
| Compose configuration       | Passed                   | Placeholder configuration and Supabase-default service graph                                                       |

The database regression created its own temporary PostgreSQL 17 container and guarded `_test` database, ran no worker, removed provider credentials and cleaned up its test resources. Retained development data was not reset. The current README screenshot was captured from the actual unconfigured application with no intercepted records.

The requested clean-code tools also ran against current source. Static complexity review prompted smaller database/message helpers, duplication analysis found no candidates at 0.8, and narrow URL/title mutation testing killed 25 meaningful mutants with five inspected equivalent survivors. These results do not establish an application-wide complexity or mutation score.

## Credential-dependent acceptance

These checks are still pending actual credentials and account access.

1. Connect the hosted Supabase project and verify its actual migrator/runtime privileges and TLS settings.
2. Apply the tracked migrations to that approved database after credentials and authorization are supplied.
3. Configure the supported Bolna caller, matching Twilio account, explicitly authorized target, signed backend and recording host allowlist.
4. Validate actual control/adversarial conversations, duration/cancellation, final billing, recordings, review, rerun and export.
5. Exercise deployment, backup/recovery and retention in the hosted environment.

The hosted Bolna API's queued-submission expiry limitation remains documented in the [provider contract](architecture/provider-contract.md). Local tests do not establish remote account capabilities, a hard external spending cap or a public deployment. No Supabase migration or real phone call was performed in this change.
