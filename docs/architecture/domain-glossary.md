# Vouch domain glossary

- **Target**: a voice agent or synthetic support system that the operator owns or is explicitly authorized to test.
- **Scope**: immutable authorization boundaries: target, window, call and duration limits, budget, identity, categories, prohibitions, and stop conditions.
- **Campaign**: a bounded group of test conversations under one configuration snapshot.
- **Run**: one realized scenario execution, with its own account state, evidence, verdict, and review history.
- **Attacker runtime**: the caller implementation. The local implementation is deterministic; Bolna is the first intended live runtime.
- **Target transport**: how the caller reaches the target. It is distinct from the caller runtime and evidence connector.
- **Verification event**: a trusted backend observation that satisfies the policy precondition. A caller assertion does not count.
- **Tool request**: an observed attempt to invoke an action. It does not prove execution.
- **Tool execution**: a target backend reports that an action ran successfully. It does not alone prove a durable state change.
- **Backend state**: an independently observed account value before and after execution.
- **Evidence tier**: transcript-only, tool-requested, tool-executed, or backend-verified. Unknown facts remain unknown.
- **Candidate finding**: a deterministic policy violation, awaiting human confirmation or dismissal.
- **Review**: an auditable human decision that leaves the recorded outcome unchanged.
- **Regression case**: a versioned export containing the captured configuration, expected policy, observed evidence, and review history.
- **Configuration digest**: SHA-256 over recursively sorted JSON object keys with array order preserved. The versioned algorithm accompanies the digest; legacy key-order-dependent digests remain explicitly unverifiable after JSONB storage.
- **Configuration integrity**: whether the exported captured configuration matches its recorded digest under a supported algorithm. It detects content differences; it is not a signature or proof of who supplied the evidence.
