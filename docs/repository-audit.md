# Vouch repository audit — 28 October 2026

Applied [ub-mode](https://github.com/unclebob/ub-mode) from the exact revision recorded in [the action log](action-log.md). The audit covered the application source, policy engine, database/worker behavior, provider boundary, UI flows, configuration, dependencies, credits, and setup instructions. This is a development audit, not a production security certification.

## Verified results

| Check                           | Result                               | Scope / limits                                                                                                                                                                 |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript and production build | Passed                               | Strict types, unused-local/parameter checks, minified Vite production build                                                                                                    |
| Unit tests                      | 52 passed                            | Policy/scope behavior and Bolna contracts through an isolated mock transport; no live call                                                                                     |
| Integration checks              | 128 passed                           | Real PostgreSQL and an isolated API/test database; includes worker recovery, authenticated telemetry, private-file canaries, allowed assets and malformed paths                |
| Browser workflow                | Passed                               | Landing, hover navigation, campaign, worker outcomes, evidence, review, export, bounded rerun, target preselection, route reload, and unavailable/unknown evidence             |
| Responsive checks               | Passed                               | Every workspace tab at 320, 390, 768, 1440 and 2560px; evidence additionally at 360 and 1920px; separate landing hero clipping checks                                          |
| Automated accessibility         | Passed                               | axe WCAG A/AA checks on landing, overview, evidence, and mobile integrations; reduced-motion handling and keyboard evidence tabs exercised                                     |
| Crapper                         | Passed                               | Every analysed production function has CRAP below 10; maximum reported score 9.9                                                                                               |
| Dryer                           | Passed                               | No duplicate candidates at similarity threshold 0.8                                                                                                                            |
| Mutator                         | Passed for executed policy mutations | 73 executed core mutations killed, zero survivors. A default-parameter site omitted by the LCOV reader was separately forced and killed; its scoped run killed all 6 mutations |
| Dependency audit                | Passed                               | No known vulnerabilities reported by pnpm at this run                                                                                                                          |
| Secret handling                 | Verified locally                     | `.env` is Git-ignored and mode 0600; actual configured secret values are absent from staged source and built assets                                                            |

Coverage is measured, not inferred from a successful UI render. The unit suite covers all executed unit-scope statements and 96%+ of branches; API integration coverage is approximately 93% statements / 82% branches. The public-file boundary has 100% statement and branch coverage from real HTTP tests. Browser source-mapped coverage is approximately 90% branches / 83% functions. These are separate scopes, not a claim of universal 100% coverage.

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
pnpm audit
```

The browser checks require the API and worker to be running and Chromium installed. For mapped browser coverage:

```sh
VOUCH_COVERAGE=1 pnpm build
VOUCH_COVERAGE=1 pnpm test:browser
node scripts/report-browser-coverage.cjs
# Restore the production build afterward:
pnpm build
```

Crapper/Dryer/Mutator sources and revision pins are listed in the action log. They were installed outside the checkout, with a writable cache and normal TLS verification. Their results are retained under ignored `artifacts/audit/` and `.metrics/`. Tests and instrumentation outputs are kept distinct from real provider validation.
