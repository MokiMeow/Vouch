# Vouch application flow

```mermaid
flowchart LR
    A[Landing page] --> B[Workspace]
    B --> C[Approved target + bounded scope]
    C --> D[PostgreSQL job queue]
    D --> E[Synthetic caller + support target]
    E --> F[Transcript + trusted backend events]
    F --> G[Deterministic policy checks]
    G --> H[Evidence and finding review]
    H --> I[Versioned regression export]
    H --> J[Same-config rerun]
    J --> K{Window and call slots available?}
    K -->|Yes| D
    K -->|No| L[Request rejected]
    C -. Live path .-> M[Bolna]
    M -.-> N[Blocked: network, caller/target setup, verified resource controls]
```

The current end-to-end workflow is explicitly synthetic. Its account writes and readbacks are real PostgreSQL operations, but its conversation is a fixture, not a live phone recording. Browser speech replay is labelled separately.

## Component responsibilities

| Component           | Responsibility                                                                                                  | Implementation                |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| React interface     | Landing, campaign configuration, findings, evidence, review actions and public guides                           | `apps/web/src/components/`    |
| Request lifecycle   | Cancel stale reads, coalesce requests, pause hidden-tab polling and preserve cached evidence on refresh failure | `apps/web/src/hooks/data.ts`  |
| Express API         | Validate requests, authorize scope, store snapshots, append reviews and serve exports                           | `apps/api/src/server.ts`      |
| PostgreSQL          | Persist targets, campaigns, runs, ordered events, account state and reviews                                     | `apps/api/src/migrate.ts`     |
| Worker              | Claim queued cases, enforce scope and global concurrency, isolate case failures                                 | `apps/api/src/worker.ts`      |
| Fixture             | Produce synthetic conversations and execute the same instrumented support tool for both scenarios               | `apps/api/src/fixture.ts`     |
| Evaluator           | Check trusted verification order, account correlation, forbidden execution and observed state                   | `packages/core/src/`          |
| Provider adapter    | Keep Bolna capabilities and read-only retrieval separate from domain rules                                      | `apps/api/src/bolna.ts`       |
| HTTP asset boundary | Publish approved pages/assets while blocking repository notes, secrets and source maps                          | `apps/api/src/public-site.ts` |

## A run from authorization to regression

1. The browser sends an approved target and scope to the API. Strict schemas validate the window, call slots, duration, budget, identity, categories and prohibited actions.
2. The API freezes configuration, records its versioned hash and reserves the initial two case slots in PostgreSQL.
3. The worker claims a case while holding the global concurrency lock. It rechecks authorization, scope, schedule, stop state and configuration integrity before executing.
4. The verified control emits a trusted verification event before its tool action. The false-authority case requests the same tool without verification. Both use the same vulnerable fixture target.
5. The fixture records ordered conversation and backend events, writes the fictional account and reads its resulting state independently.
6. Pure evaluation checks the recorded facts. Spoken assertions cannot satisfy backend verification. Verdict, evidence tier and durable state outcome remain separate.
7. The API returns persisted evidence to the workspace. Human confirmation or dismissal appends review history without replacing the deterministic result.
8. Export includes captured configuration, policy, integrity metadata, events, verdict and reviews. Rerun retains that configuration, consumes a remaining slot and repeats scope checks.

The future live flow replaces the fixture with a verified caller runtime, authorized transport and customer evidence connector. It must preserve these boundaries and add actual audio plus provider-enforced resource controls. See [project status](project-status.md) for the remaining delivery sequence.
