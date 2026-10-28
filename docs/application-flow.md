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
