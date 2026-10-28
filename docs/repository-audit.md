# Vouch repository audit — 28 October 2026

Applied [ub-mode](https://github.com/unclebob/ub-mode) from the exact revision recorded in [the action log](action-log.md). The audit covered the application source, policy engine, database/worker behavior, provider boundary, UI flows, configuration, dependencies, credits, and setup instructions. This is a development audit, not a production security certification.

## Verified results

| Check                           | Result                        | Scope / limits                                                                                                                                                                              |
| ------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and production build | Passed                        | Strict types, unused-local/parameter checks, minified Vite production build                                                                                                                 |
| Unit tests                      | 60 passed                     | Policy/scope behavior, digest stability/integrity and Bolna contracts through an isolated mock transport; no live call                                                                      |
| Integration checks              | 168 passed                    | Real PostgreSQL and isolated API; queue recovery, digest verification, telemetry, public-file boundaries and the explicitly published Docs/assets routes                                    |
| Browser workflow                | Passed                        | Campaign → worker → evidence → review → export/rerun, plus stale-response, overlap, retry, real timeout, cached-evidence and compatibility regressions                                      |
| Responsive checks               | Passed                        | Every workspace tab and all seven Docs guides at 320, 390, 768, 1440 and 2560px; evidence additionally at 360 and 1920px; separate landing hero clipping checks                             |
| Automated accessibility         | Passed                        | axe WCAG A/AA on landing, overview, evidence, mobile integrations and all Docs chapters; named landmarks, keyboard tables/tabs and reduced motion                                           |
| Crapper                         | Passed                        | Every analysed production function has CRAP below 10; maximum reported score 9.0                                                                                                            |
| Dryer                           | Passed                        | No duplicate candidates at similarity threshold 0.8                                                                                                                                         |
| Mutator                         | Passed for executed mutations | 74 executed core mutations and 11 configuration mutations killed, zero survivors. One LCOV-omitted default-parameter mutant was independently killed in an isolated baseline-verified clone |
| Dependency audit                | Passed                        | No known vulnerabilities reported by pnpm at this run                                                                                                                                       |
| Secret handling                 | Verified locally              | `.env` is Git-ignored and mode 0600; actual configured secret values are absent from staged source and built assets                                                                         |

Coverage is measured, not inferred from a successful UI render. The unit suite covers 97%+ of branches; API integration coverage is approximately 94% statements / 81% branches. The public-file boundary has 100% statement and branch coverage from real HTTP tests. Browser source-mapped coverage is approximately 90% branches / 83% functions, including the added documentation surface; the extracted request lifecycle has 95% branch coverage. These are separate scopes, not universal 100% coverage. See the [performance audit](performance-audit.md) for measured payloads, request paths and browser-race reproduction.

An initial minified-bundle coverage result was implausible. It was discarded. The browser runner now checkpoints before full navigations and merges actual V8 function ranges against an unminified coverage build. Normal production builds retain minification and omit source maps. Local coverage builds create maps on disk for analysis; HTTP access to maps is rejected in either mode. `scripts/report-browser-coverage.cjs` generates the mapped report.

## Reproduced and fixed findings

1. **Worker SQL errors could abort failure recording.** A failing fixture SQL statement left the transaction unusable, so the job could retry indefinitely. A savepoint now rolls back the failed case before storing its failure. An integration test pre-populates a conflicting account row and proves recovery.
2. **A successful sibling could erase a campaign failure.** Campaign completion now preserves failed status when any case failed. The same recovery test proves that the later successful case does not overwrite it.
3. **Regression exports used the current global policy.** Expected assertions now come from the run's captured policy. A historical-policy test proves the exported requirement stays historical.
4. **Incompatible captured configurations could execute as today's fixture.** The worker validates the captured policy, runtime, scenario identity, and scenario contents; it rejects unknown categories, changed prompts and incompatible runtime/model snapshots.
5. **Malformed request errors could expose request fragments.** Malformed JSON now returns a generic 400; oversized JSON returns a generic 413. Provider JSON parsing also returns a bounded message rather than echoing upstream body fragments.
6. **Dotfile URLs fell through to the SPA response.** Dotfiles were not served as secret files, but received an incorrect 200 fallback. They are now explicitly rejected with 404 before the SPA catch-all.
7. **Evidence presentation contained fixed values and oversized components.** Backend changes are now read from actual events; unchanged and unknown are distinct. Policy version/precondition and model/API provenance use captured configuration. UI orchestration and policy evaluation were split into smaller units.
8. **Accessibility and narrow-screen defects.** Increased contrast, used readable type, added native modal focus containment and keyboard tabs, and fixed hero text clipping at 320px. Hover/focus navigation provides feedback without activating another route.
9. **Missing provider-boundary contract coverage.** Tests now cover exact hosted API paths and authorization headers, selected-agent behavior, execution retrieval, malformed responses, denied responses, absent credentials, network failure and fail-closed dispatch.
10. **Public build exposed debugging material and internal file URLs returned a success page.** The server now publishes a defined set of page routes and asset types. Private documents, audit output, credentials and source maps return 404, including when canary files are accidentally present inside the built output. Unused full-resolution branding originals were moved out of the public directory; optimized web images remain. Internal Tessory/network setup notes were removed from the public credits page while preserving required creator and license notices.
11. **Environment-specific values appeared as application defaults.** The API requires `DATABASE_URL` from its environment or ignored `.env`; the embedded credential fallback was removed. Local Docker setup also reads its database, credentials and port from that URL, passes credentials through environment variables, and verifies a real authenticated database query. Integration tests derive a separate `_test` database from configured settings instead of embedding credentials. Workspace chrome no longer pretends to identify a Northstar organization. Dates use the browser's locale/timezone and display the actual timezone instead of a fixed IST suffix. Fixture identities and versioned policy constants remain deliberate domain/test data.
12. **Configuration hashes could not be reproduced from exported JSONB.** The failing integration test compared the exported configuration with its advertised digest. New digests use a named recursively sorted JSON algorithm; exports/details carry their algorithm and integrity state. Migration preserves historical digests as explicitly unverifiable. Changed or unsupported captured digests and changed parent scopes are rejected before execution/rerun. Hash comparisons remain content checks, not source-authentication signatures.
13. **One malformed stored schedule blocked the whole queue.** Casting an invalid `startsAt` failed before the worker could record a job failure. PostgreSQL now validates timestamp input before casting it, allowing the malformed job to be marked failed and the following healthy campaign to complete. The integration suite first reproduced the queue failure and then proved recovery.
14. **A late browser response could display the wrong run.** The performance tester reproduced run A replacing run B while the URL still pointed to B. Requests now have per-resource path/controller guards, cancellation, one in-flight read, timeouts, hidden-tab pausing and post-mutation reload sequencing. Missing records offer retry; transient refresh failures preserve the last fetched evidence and tab. Browser regressions include a real 15-second timeout and operation without `AbortSignal.any`/`timeout`.
15. **Repeated full configurations and repeated list filtering wasted work.** Overview queries now select summary fields, reducing the measured payload by 66.05% on an unchanged dataset. Campaign rows share a grouped run index instead of filtering the entire run list per campaign. Overview polling uses 2.5 seconds during active work and 30 seconds when idle. History is still not paginated; this is documented as a scaling limit.
16. **Reordered evidence could overstate backend proof.** The evaluator now orders its copied backend events by authoritative sequence before correlating actions. A failing test showed a later action's state being attached to an earlier violation when an input array was shuffled; it now remains unknown for that earlier action.
17. **Input and evidence-source mismatches.** Fractional millisecond values no longer reach PostgreSQL's integer column. External evidence cannot silently reinterpret an unsupported captured policy. Provider records no longer receive fixture/PostgreSQL-only labels in the UI, and captured digest mismatches are visible.
18. **Runtime settings could fail inconsistently.** The Vite development proxy now follows configured API host/port; a nondefault configuration was checked. Database connections and statements have bounded waits. Request lifecycle and digest presentation were split after the complexity gate flagged them; all analysed production functions now score below 10.
19. **Documentation and visual navigation gaps.** Added a dedicated seven-guide Docs surface with accurate public product content, functional code copying and failure feedback, search, table of contents and mobile navigation. Fixed the first rendered contrast failures, made the mobile Docs shortcut persistently visible, wrapped mobile tables and limited reading width. Generated original non-draggable mascots and retained OpenCode's inspected MIT license. Shared footer credits and small Docs functions satisfy the duplication/complexity gates without changing the actual workflow.

The HTTP boundary does not change GitHub repository visibility. Committed documentation is available to anyone who can read the repository. There is still no production user/session gate for workspace data: the server remains restricted to loopback, and public deployment requires authentication and authorization first.

## Remaining blockers and limits

- **Tessory was not inspected.** Actual requests to its llms.txt/catalog returned proxy HTTP 403. The last managed-runtime observation still reported applied policy revision 1, restricted access, and no custom domains. The exact domain was saved in the draft. No Tessory source or license is claimed to have been reviewed or copied.
- **Live Bolna end-to-end testing is not complete.** The credential is configured locally, but the repeated actual read-only provider request could not reach Bolna through the active network policy. The application's sanitized check returned HTTP 400 with a network-access error; this does not establish whether the provider would accept or reject the key. No successful authentication or live call is claimed.
- **Caller and approved target configuration are still required.** BOLNA_AGENT_ID, an operator-authorized target, its authorization reference, and target-side evidence access cannot be inferred from an API key.
- **Live dispatch stays disabled.** Hard duration, cancellation, budget reservation and provider reconciliation need implementation and credentialed validation. A model instruction to stop is not enforcement.
- **This remains a loopback-only, single-workspace development app.** Production authentication, tenant isolation, artifact retention/encryption and operational deployment remain outside the current verified workflow. Publication and fresh-task restoration were not performed or claimed.
- **Synthetic speech replay is not a call recording.** Native browser voice availability varies. The UI labels replay and unavailable recordings explicitly.

## Reproduce the checks

```sh
pnpm build
pnpm test
pnpm test:integration
pnpm test:browser
pnpm test:browser:requests
pnpm test:browser:design
pnpm audit
```

The browser checks require the API and worker to be running and Chromium installed. For mapped browser coverage:

```sh
VOUCH_COVERAGE=1 pnpm build
VOUCH_COVERAGE=1 pnpm test:browser
VOUCH_COVERAGE=1 pnpm test:browser:requests
VOUCH_COVERAGE=1 pnpm test:browser:design
node scripts/report-browser-coverage.cjs
# Restore the production build afterward:
pnpm build
```

Crapper/Dryer/Mutator sources and revision pins are listed in the action log. They were installed outside the checkout, with a writable cache and normal TLS verification. Their results are retained under ignored `artifacts/audit/` and `.metrics/`. Tests and instrumentation outputs are kept distinct from real provider validation.
