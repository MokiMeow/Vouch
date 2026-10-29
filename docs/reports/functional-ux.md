# Functional UX follow-up

October 29, 2026.

The user reported that the site looked finished but did not guide useful work. A fresh local capture reproduced a concrete problem. Overview and Integrations both rendered the same connection screen, with no diagnostic path. The campaign form also lacked a review step, which a new browser regression reproduced before the fix.

## Journey and repairs

| Step                  | Previous gap                                                                   | Current behavior                                                                                                         | Verification                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Open the workspace  | A single blocked screen with a generic retry                                   | Safe database/schema diagnostics and an expandable setup checklist                                                       | Actual placeholder-only application captured at desktop and phone widths                                                              |
| 2 Register a target   | Empty overview led toward an unlaunchable campaign                             | First-use guidance opens registration and returns to the stored target                                                   | Actual browser entered a target through the actual API, then reloaded and compared database values                                    |
| 3 Finish integrations | The Integrations page depended on overview data                                | Independent setup endpoint reports eight configuration/service checks, exact field names and next actions                | Actual API checks, disclosure contents and refresh matched the stored configuration                                                   |
| 4 Review a campaign   | One long form with no separate review boundary                                 | Scope then frozen review, renewed authorization after edits, final launch only, duplicate guard and first-run navigation | Browser observed zero launch requests before authorization, one request during repeated submission, and preserved input after failure |
| 5 Stop work           | Immediate action without confirmation                                          | Explicit confirmation, cancellation explanation, duplicate guard and inline retry                                        | Opening or cancelling the dialog sent no request; repeated confirmation sent one request                                              |
| 6 Explore results     | Empty filters had no reset action and overview failures blocked separate pages | Clear filters resets URL state, while findings and evidence load independently                                           | Browser history/search checks and a deliberately unavailable overview                                                                 |

## Service behavior

`GET /api/setup` requires workspace access and never returns credential values, connection URLs, phone allowlists or raw driver messages. It distinguishes missing settings, invalid connections, rejected credentials, missing migration/schema access, network failures and bounded timeouts. Provider configuration is checked locally without contacting the provider. Only an owner can explicitly run the separate read-only caller check.

Migration `006_service_heartbeats.sql` adds shared worker liveness without business seeds. A successful database tick writes a healthy per-instance observation. A failed tick or graceful shutdown marks that instance unavailable. API and worker can run in separate containers. Stale or failed observations cannot become healthy from a local timestamp alone.

## Evidence

- 106 unit tests passed, including campaign review, safe diagnostics and heartbeat behavior.
- 177 isolated PostgreSQL/API assertions passed. This includes 54 first-use browser/API checks, eight real zero-job worker checks and the previous report/authentication regressions.
- Both browser suites passed. The workflow suite covers review, authorization, duplicate submission, failure recovery, launch navigation, Stop confirmation, changing prerequisites, independent evidence, setup refresh and filter reset.
- Desktop and phone captures were inspected from the actual unconfigured application and from the actual isolated target-registration journey. Browser-only campaign/Stop cases use intercepted records and do not establish provider behavior.
- Nineteen bounded accessibility scans passed across product screens, actual setup screens and the new review/Stop dialogs, including the review error state.

Pinned Crapper and Dryer tools reviewed the changed workflow source. Static complexity has no fresh CRAP measurement; duplication analysis found no candidates at 0.8. Narrow review-helper mutation checks found a real precision gap where a tiny amount could be reviewed as zero cents despite the stated two-decimal rule. A failing regression reproduced it, then strict decimal input validation fixed it while preserving legitimate fractional currency. This is focused quality evidence, not a whole-repository certification.

Current audit captures are under ignored `artifacts/ux-followup/`, `artifacts/functional-journey/` and `artifacts/verification/`. The pre-fix review failure is retained there. Captures are not seeded into the website. A valid placeholder-only setup screenshot is deliberately included in the README.

## Limits

The integration runner created its own random temporary PostgreSQL container and test database. It verified zero campaigns, runs and executions before starting the worker, stripped provider credentials and kept live calling disabled. That worker was stopped before report records were inserted. Cleanup removed only temporary resources. Retained data was not reset.

Hosted Supabase access, actual calls, signed customer delivery, carrier cancellation, finalized billing and hosted backup/recovery still require credentials and operator acceptance. Isolated tests do not establish these account capabilities or full accessibility compliance. Missing observations remain unavailable or unknown.
