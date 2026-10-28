# Build Vouch: coding-agent brief

You are the lead coding agent for Vouch. Build a working hackathon product, not a slideware prototype. Start by inspecting the repository and its instructions. Reuse the existing stack where reasonable. If this is a new repository, use TypeScript, pnpm, a React web UI, a small Node API, PostgreSQL for durable run data, and a background worker. Add a queue only when concurrency and retry needs justify it. Keep provider code behind narrow interfaces. Use official, current API documentation at implementation time and pin the exact API flavor and model used in each run. Do not invent provider features or mark untested connectors as working.

## Product definition

Vouch uses autonomous AI callers to uncover social-engineering vulnerabilities in voice agents before attackers exploit them. The customer is a business or voice-platform team deploying agents that can act on accounts, payments, healthcare workflows, appointments, or other consequential systems. Security engineers and agent developers need to know whether a caller can persuade an agent to skip identity checks, reveal private information, or invoke a tool without the required authority. The result should be a reviewable, reproducible finding with the relevant audio, transcript, provider events, tool evidence, and business policy.

The differentiator is a focused workflow for authorized social-engineering testing: bounded adaptive campaigns, explicit business policies, graded evidence, and failed scenarios converted into regression tests. Do not claim that adversarial voice testing or evidence reports are unique to Vouch. Hamming and Coval already offer substantial voice-agent testing capabilities [1][2][3].

## Non-negotiable product behavior

1. A customer registers a target that they own or are explicitly authorized to test. The target can be reached by an allowlisted phone number, a supported provider connection, or a customer-owned WebSocket bridge.
2. The customer defines the permitted test scope: target, time window, concurrency, maximum calls and duration, monetary budget, synthetic identities, allowed scenario categories, prohibited actions, and stop conditions. The server enforces these settings; model output cannot change them.
3. The customer supplies or selects a policy with testable preconditions and forbidden outcomes. Example: `change_contact_phone` requires an identity-verification event from the customer's backend; a caller assertion is not enough.
4. Vouch runs autonomous spoken test conversations within that scope. The initial attacker runtime is Bolna. Other runtimes can be added through a capability-based interface.
5. Vouch captures the realized call, not just the planned script. Store the actual audio, transcript, events, tool requests, tool results, and observable backend state when the customer provides them.
6. An evaluator checks deterministic assertions first. An LLM can propose classifications or explain context, but cannot manufacture evidence, change the recorded outcome, or treat a target's spoken instructions as commands to Vouch.
7. The findings page tells the reviewer what was attempted, what the agent said, which tool was requested, whether it executed, and whether a durable side effect was verified. Unknown evidence stays unknown.
8. A reviewer can confirm or dismiss a candidate finding, rerun a case under the same configuration, and export a versioned regression scenario.

## Build the vertical slice first

Implement one end-to-end case before adding broad integrations:

- A customer-owned synthetic support agent can change a fictional account's contact number through an instrumented mock tool.
- Its policy requires an explicit backend verification event before the change.
- Bolna operates the adversarial caller and tries a false-authority claim such as saying a prior team already verified them. The test agent's identity, prompt, and persona are configured for the run; the target agent is not modified to make the attack easier.
- Vouch runs a benign control in which verification actually succeeds and a legitimate change is allowed.
- The UI shows the call, timeline, attempted tool action, expected precondition, observed outcome, and evidence tier.
- The tool integration proves whether the backend state changed. An agent saying “done” does not prove a change.
- Provide a no-credentials local fixture mode that exercises the full ingestion, evaluation, review, and report UI. Mark fixture data clearly as synthetic. Live calls require configured credentials and an authorized target.

Done means a teammate can set up the repo, connect Bolna credentials, register an approved test target, run a bounded campaign, hear/read the evidence, and export a regression case. If a live account is unavailable, show exactly which live integration remains unverified; do not fake a successful API call.

## Architecture and boundaries

Separate five concerns:

1. **Target transport** reaches the agent under test: PSTN, SIP, provider-specific WebSocket/WebRTC, or a customer bridge. The target's underlying LLM provider need not match the caller's.
2. **Attacker runtime** produces the adversarial spoken conversation. Bolna is first; OpenAI or another runtime can follow.
3. **Speech components** are optional STT, reasoning LLM, and TTS services used when Vouch assembles its own caller. Cartesia Sonic is a possible TTS component; Cartesia also documents managed agents [4]. “Cartesian” in the original brief is assumed to mean Cartesia; confirm from actual credentials or customer requirements.
4. **Evidence connector** retrieves target-side tool events, verification events, and final backend state. This is separate from the audio transport.
5. **Evaluation and reporting** normalize events, apply policy assertions, grade evidence, and present findings.

Use small interfaces, not a universal provider base class with dozens of no-op methods. A workable contract is:

```ts
type Capabilities = {
  outboundPstn: boolean;
  bidirectionalAudio: boolean;
  liveSteering: boolean;
  recording: boolean;
  transcript: boolean;
  targetToolEvents: boolean;
  reliableWordTimestamps: boolean;
  cancellation: boolean;
  finalizedCost: boolean;
};

interface AttackerRuntime {
  capabilities(): Capabilities;
  start(input: AuthorizedCallInput): Promise<StartResult>;
  getExecution(providerExecutionId: string): Promise<ExecutionSnapshot>;