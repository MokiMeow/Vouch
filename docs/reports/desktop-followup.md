# Desktop report follow-up

Updated on October 29, 2026. This follows the supplied desktop report and the subsequent real-data-only, Supabase and visual-design instructions.

| Report | Change                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1     | Shared run titles feed both UI and global search. Actual outcomes and visible text are searchable. Unobserved controls are not labelled verified. |
| M2     | Dedicated tenant-scoped findings query searches the full workspace before paginating. Counts and rows use one database snapshot.                  |
| M3     | Location changes close workspace dialogs, including browser Back.                                                                                 |
| M4     | One primary row anchor with aligned arrow and an independent, visibly labelled Stop action replaces the empty icon layout.                        |
| L1     | Navigation clears action errors and late responses cannot attach errors to a different page.                                                      |
| L2     | Run ID is validated as a named field with a friendly UUID message.                                                                                |
| L3     | Trimmed form values and field-level messages replace validator internals.                                                                         |
| L4     | Query pagination validates an object, preserving field names in messages.                                                                         |
| L5     | Whitespace search is normalized to empty.                                                                                                         |
| L6     | Findings totals/footer use conversation counts and correct singular/plural.                                                                       |
| L7     | Review status appears only on candidate violations.                                                                                               |
| L8     | Rerun shows remaining slots and disables for stopped/exhausted/outside-window/nonterminal runs. Server checks remain authoritative.               |
| L9     | UI disables empty exports and API returns 409 until actual call evidence exists.                                                                  |
| L10    | Search, outcome and page are URL state; detail links retain their return view.                                                                    |
| L11    | Shared server scope limits windows to 1–1440 minutes; the form derives both timestamps from one instant.                                          |
| L12    | Campaign navigation is one native link supporting modifier-click/new-tab, with Stop as a separate action.                                         |
| L13    | Docs search has one visible parent focus ring.                                                                                                    |
| L14    | Mascot artwork was removed rather than squeezed beside links.                                                                                     |

Landing Docs now opens in a separate tab, API status guidance is ordered and scope/review/rerun/export guidance matches the implementation. Docker is documented for isolated tests and optional local deployment. Supabase migrator privileges are documented explicitly, with managed-owner preflight instead of assuming a superuser.

The earlier demo-seed suggestion was superseded by the later explicit no-mock-data instruction. No business records are seeded. The portable cloud installer was executed from outside the checkout and skipped unconfigured database access.

## Visual references and assets

Read Tessory's public `/llms.txt` and `/api/gallery` without uploading project briefs, source or credentials. Inspected these actual previews and creator pages.

- [Pagination Ant by antdesign](https://21st.dev/@antdesign/components/pagination-ant/jumper) informed restrained page controls and accurate result counts. Tessory marks original source access and creator terms unverified, so no component code was reused.
- [Command Menu by affectUI](https://www.affectui.com/components/command-menu) informed a single focus treatment and clear search hierarchy. The catalog lists paid source access even though it also carries a library license note. Paid code was not accessed or copied.

The user selected the second generated direction. Vouch's new background is an original generated image, optimized as `vouch-current.webp`. It is decorative only and limited to the top region. Fine dividers, electric-blue actions, readable type and existing licensed icons preserve the developer workflow without fabricated statistics or mascot panels.

## Evidence and limits

Passed 79 unit checks, 113 real PostgreSQL/API assertions in an isolated temporary database, browser regressions over 71 test-only intercepted records, all seven Docs guides and 16 desktop/mobile accessibility scans. The real placeholder-only application was also captured without data interception. Its console and overflow checks passed.

The requested Uncle Bob workflow used the pinned tools recorded in the action log. Static Crapper analysis covered 31 changed application modules; no fresh application-wide CRAP score is claimed. Connection validation and friendly-message formatting were split into smaller helpers. Dryer found no duplicate candidates at the 0.8 threshold.

Narrow mutation testing of URL state and run-title presentation killed 25 meaningful mutants. Five equivalent survivors were inspected individually because they normalize to the same visible result. The default return-link expression needed a separate baseline-tested run because the tool's LCOV reader omitted a covered parameter expression. These are focused checks, not application-wide mutation coverage.

No provider or hosted Supabase request was made. Actual calls, remote migrations, billing semantics and hosted recovery remain credential-dependent. These results are not a claim that an unconfigured provider or remote database works.
