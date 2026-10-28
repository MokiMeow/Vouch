import { EnvHttpProxyAgent, fetch, type Dispatcher } from "undici";
import { z } from "zod";
import {
  bolnaDocument,
  currentCostContract,
  normalizeExecution,
  readProviderJson,
  type ExecutionSnapshot,
  type ProviderDocument,
} from "./model";
import { TwilioCallControl, twilioConfigured } from "./telephony";
import { canonicalJson } from "../../campaigns/configuration";
export type { ExecutionSnapshot } from "./model";
const providerIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/);

export type Capabilities = {
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
const capabilitiesSchema = z.object({
  outboundPstn: z.boolean(),
  bidirectionalAudio: z.boolean(),
  liveSteering: z.boolean(),
  recording: z.boolean(),
  transcript: z.boolean(),
  targetToolEvents: z.boolean(),
  reliableWordTimestamps: z.boolean(),
  cancellation: z.boolean(),
  finalizedCost: z.boolean(),
});
const promptsSchema = z.record(
  z.string(),
  z.object({ system_prompt: z.string().min(1).max(24000) }),
);
export const runtimeSnapshotSchema = z.object({
  provider: z.literal("bolna"),
  apiFlavor: z.literal("hosted-rest-agent-v2-execution-unversioned"),
  agentId: providerIdSchema,
  model: z.string().min(1).max(200),
  agentConfig: bolnaDocument,
  agentPrompts: promptsSchema,
  maxDurationSeconds: z.number().int().min(1).max(300),
  capabilities: capabilitiesSchema,
  costContract: z.object({
    unit: z.enum(["cents", "usd", "unknown"]),
    currency: z.enum(["USD", "unknown"]),
    finalCostVerified: z.boolean(),
  }),
  controls: z.object({
    hardDuration: z.boolean(),
    cancellation: z.boolean(),
    finalizedCost: z.boolean(),
  }),
});
export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>;
export type StartInput = {
  agentId: string;
  phone: string;
  runId?: string;
  scenario?: string;
  maxDurationSeconds?: number;
  userData?: Record<string, unknown>;
  expectedPrompt?: string;
  expectedModel?: string;
  expectedConfiguration?: RuntimeSnapshot;
  endsAt?: string;
  authorizeDispatch?: () => Promise<void>;
};
export interface AttackerRuntime {
  capabilities(): Capabilities;
  start(input: StartInput): Promise<{ providerExecutionId: string }>;
  getExecution(id: string): Promise<ProviderDocument>;
}
const proxy = new EnvHttpProxyAgent();
type ClientOptions = { apiKey?: string; dispatcher?: Dispatcher };
const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);
const startSchema = z.object({
  agentId: providerIdSchema,
  phone: phoneSchema,
  runId: z.string().uuid(),
  scenario: z.string().min(1).max(100),
  maxDurationSeconds: z.number().int().min(1).max(300),
  userData: z.record(z.string(), z.unknown()).optional(),
  expectedPrompt: z.string().min(1).max(24000),
  expectedModel: z.string().min(1).max(200),
  endsAt: z.iso.datetime(),
});
export class DispatchNotSubmittedError extends Error {
  readonly dispatchNotSubmitted = true;
  constructor(
    message = "Live dispatch was blocked before submission. No outbound call was made.",
  ) {
    super(message);
    this.name = "DispatchNotSubmittedError";
  }
}
export class ProviderHttpError extends Error {
  constructor(readonly status: number) {
    super(`Bolna returned HTTP ${status}`);
    this.name = "ProviderHttpError";
  }
}
export class DispatchUnknownError extends Error {
  readonly dispatchUnknown = true;
  constructor() {
    super(
      "Bolna dispatch may have been accepted. Reconcile the isolated caller before any new submission.",
    );
    this.name = "DispatchUnknownError";
  }
}
function rejectCredentials(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) rejectCredentials(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (
      /(?:api.?key|auth.?token|password|secret|authorization|credential)/i.test(
        key,
      )
    )
      throw new Error(
        "Caller configuration contains credential fields and cannot be captured",
      );
    rejectCredentials(item);
  }
}
function record(value: unknown, label: string): ProviderDocument {
  const parsed = bolnaDocument.safeParse(value);
  if (!parsed.success) throw new Error(`Bolna returned an invalid ${label}`);
  return parsed.data;
}
function boundedAgent(config: ProviderDocument, maxDurationSeconds: number) {
  const tasks = z.array(bolnaDocument).length(1).parse(config.tasks);
  const task = tasks[0];
  const tools = record(task.tools_config, "caller tools configuration");
  const input = record(tools.input, "caller input configuration");
  const output = record(tools.output, "caller output configuration");
  const llm = record(tools.llm_agent, "caller model configuration");
  const modelConfig = record(llm.llm_config, "caller model configuration");
  if (
    task.task_type !== "conversation" ||
    input.provider !== "twilio" ||
    output.provider !== "twilio" ||
    llm.agent_type !== "simple_llm_agent" ||
    typeof modelConfig.model !== "string" ||
    !modelConfig.model
  )
    throw new Error(
      "Live campaigns require a single-task Twilio simple LLM caller with a pinned model",
    );
  // Only speech components are retained. No target tools, transfers, webhooks or
  // graph nodes can be inherited into the isolated testing caller.
  for (const item of [llm, modelConfig])
    if (
      ["tools", "functions", "api_tools", "tools_params", "agent_graph"].some(
        (key) => Object.hasOwn(item, key),
      )
    )
      throw new Error(
        "The caller template must not contain tools or transfer capabilities",
      );
  const taskConfig =
    task.task_config === undefined
      ? {}
      : record(task.task_config, "call timing configuration");
  const agentConfig = {
    agent_name: "Vouch authorized test caller",
    agent_type: "other",
    agent_welcome_message:
      "Hello. I am calling about my fictional support account.",
    tasks: [
      {
        task_type: "conversation",
        tools_config: {
          llm_agent: llm,
          synthesizer: record(tools.synthesizer, "caller speech configuration"),
          transcriber: record(
            tools.transcriber,
            "caller transcription configuration",
          ),
          input,
          output,
        },
        toolchain: record(task.toolchain, "caller toolchain"),
        task_config: {
          call_terminate: Math.max(1, maxDurationSeconds - 3),
          hangup_after_silence:
            typeof taskConfig.hangup_after_silence === "number" &&
            Number.isInteger(taskConfig.hangup_after_silence) &&
            taskConfig.hangup_after_silence > 0
              ? Math.min(taskConfig.hangup_after_silence, maxDurationSeconds)
              : Math.min(20, maxDurationSeconds),
        },
      },
    ],
  };
  rejectCredentials(agentConfig);
  return { agentConfig, model: modelConfig.model };
}
function assertLiveEnabled() {
  if (
    process.env.VOUCH_LIVE_ENABLED !== "true" ||
    process.env.VOUCH_RATE_CEILING_CONFIRMED !== "true" ||
    !twilioConfigured()
  )
    throw new Error(
      "Live dispatch is disabled until configured provider and Twilio call controls are enabled. No outbound call was made.",
    );
}
export function validateRuntimeSnapshot(value: unknown): RuntimeSnapshot {
  const snapshot = runtimeSnapshotSchema.parse(value);
  rejectCredentials(snapshot);
  const bounded = boundedAgent(
    snapshot.agentConfig,
    snapshot.maxDurationSeconds,
  );
  if (bounded.model !== snapshot.model)
    throw new Error(
      "Captured caller model does not match its effective configuration",
    );
  return { ...snapshot, agentConfig: bounded.agentConfig };
}
export function assertExecutionIdentity(
  snapshot: ExecutionSnapshot,
  expected: { id: string; agentId: string; phone: string; runId: string },
) {
  const actualId = snapshot.raw.id ?? snapshot.raw.execution_id;
  if (
    snapshot.id !== expected.id ||
    (actualId !== undefined && actualId !== expected.id) ||
    snapshot.agentId !== expected.agentId ||
    snapshot.targetPhone !== expected.phone ||
    (snapshot.correlationRunId !== null &&
      snapshot.correlationRunId !== expected.runId)
  )
    throw new Error(
      "Provider execution identity does not match the authorized run and target",
    );
}
// Official bolna-ai/mcp 8911a986 and bolna-ai/bolna 30cf553b define the
// supported contracts. Unknown POST outcomes are never transparently retried.
export class BolnaRuntime implements AttackerRuntime {
  constructor(private readonly options: ClientOptions = {}) {}
  capabilities(): Capabilities {
    return {
      outboundPstn: true,
      bidirectionalAudio: false,
      liveSteering: false,
      recording: true,
      transcript: true,
      targetToolEvents: false,
      reliableWordTimestamps: false,
      cancellation: twilioConfigured(),
      finalizedCost:
        ["cents", "usd"].includes(process.env.BOLNA_COST_UNIT ?? "") &&
        process.env.BOLNA_COST_CURRENCY === "USD" &&
        process.env.BOLNA_FINAL_COST_VERIFIED === "true",
    };
  }
  private async request(
    path: string,
    body?: unknown,
    submission = false,
    method?: string,
  ): Promise<unknown> {
    const key = this.options.apiKey ?? process.env.BOLNA_API_KEY;
    if (!key) throw new Error("BOLNA_API_KEY is not configured");
    let response;
    try {
      response = await fetch(`https://api.bolna.ai${path}`, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        dispatcher: this.options.dispatcher ?? proxy,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch {
      if (submission) throw new DispatchUnknownError();
      throw new Error(
        "Unable to reach Bolna through the configured network. Check the active network policy and provider access.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (submission && (response.status >= 500 || response.status === 408))
        throw new DispatchUnknownError();
      throw new ProviderHttpError(response.status);
    }
    try {
      return await readProviderJson(response, 2 * 1024 * 1024);
    } catch {
      if (submission) throw new DispatchUnknownError();
      throw new Error("Bolna returned an unreadable JSON response");
    }
  }
  async listAgents() {
    return z.array(bolnaDocument).parse(await this.request("/v2/agent/all"));
  }
  async getExecution(id: string) {
    providerIdSchema.parse(id);
    return record(
      await this.request(`/executions/${encodeURIComponent(id)}`),
      "execution document",
    );
  }
  async executionSnapshot(id: string, capturedRuntime?: RuntimeSnapshot) {
    return normalizeExecution(
      id,
      await this.getExecution(id),
      capturedRuntime?.costContract,
    );
  }
  async checkConnection() {
    if (process.env.BOLNA_AGENT_ID) {
      providerIdSchema.parse(process.env.BOLNA_AGENT_ID);
      const agent = record(
        await this.request(
          `/v2/agent/${encodeURIComponent(process.env.BOLNA_AGENT_ID)}`,
        ),
        "agent document",
      );
      return { agentId: agent.id ?? process.env.BOLNA_AGENT_ID, agentCount: 1 };
    }
    const agents = await this.listAgents();
    return { agentCount: agents.length, agentId: null };
  }
  async prepare(
    agentId: string,
    maxDurationSeconds: number,
  ): Promise<RuntimeSnapshot> {
    providerIdSchema.parse(agentId);
    z.number().int().min(1).max(300).parse(maxDurationSeconds);
    const agent = record(
      await this.request(`/v2/agent/${encodeURIComponent(agentId)}`),
      "caller template",
    );
    const config = record(agent.agent_config, "caller template configuration");
    const { agentConfig, model } = boundedAgent(config, maxDurationSeconds);
    const agentPrompts = promptsSchema.parse(agent.agent_prompts);
    const capabilities = this.capabilities();
    return validateRuntimeSnapshot({
      provider: "bolna",
      apiFlavor: "hosted-rest-agent-v2-execution-unversioned",
      agentId,
      model,
      agentConfig,
      agentPrompts,
      maxDurationSeconds,
      capabilities,
      costContract: currentCostContract(),
      controls: {
        hardDuration: true,
        cancellation: capabilities.cancellation,
        finalizedCost: capabilities.finalizedCost,
      },
    });
  }
  async provision(
    snapshotInput: RuntimeSnapshot,
    runId: string,
    scenarioPrompt: string,
    onProvisioned?: (agentId: string) => Promise<void>,
  ) {
    assertLiveEnabled();
    const snapshot = validateRuntimeSnapshot(snapshotInput);
    z.string().uuid().parse(runId);
    z.string().min(1).max(24000).parse(scenarioPrompt);
    if (!snapshot.controls.hardDuration || !snapshot.controls.cancellation)
      throw new Error(
        "Captured caller does not support the required live controls",
      );
    const config = structuredClone(snapshot.agentConfig);
    config.agent_name = `Vouch ${runId}`;
    const prompts = { task_1: { system_prompt: scenarioPrompt } };
    const result = record(
      await this.request("/v2/agent", {
        agent_config: config,
        agent_prompts: prompts,
      }),
      "provisioned caller document",
    );
    const agentId = result.agent_id ?? result.id;
    if (!providerIdSchema.safeParse(agentId).success)
      throw new Error(
        "Provisioned caller response has no agent identifier. No call was submitted.",
      );
    const callerId = providerIdSchema.parse(agentId);
    if (onProvisioned) await onProvisioned(callerId);
    const actual = record(
      await this.request(`/v2/agent/${encodeURIComponent(callerId)}`),
      "provisioned caller readback",
    );
    const actualConfig = boundedAgent(
      record(actual.agent_config, "provisioned caller configuration"),
      snapshot.maxDurationSeconds,
    );
    const actualTask = z
      .array(bolnaDocument)
      .length(1)
      .parse(
        record(actual.agent_config, "provisioned caller configuration").tasks,
      )[0];
    const actualTiming = record(
      actualTask.task_config,
      "provisioned timing configuration",
    );
    const actualPrompts = promptsSchema.parse(actual.agent_prompts);
    if (
      canonicalJson(actualConfig.agentConfig) !==
        canonicalJson(snapshot.agentConfig) ||
      actualTiming.call_terminate !==
        Math.max(1, snapshot.maxDurationSeconds - 3) ||
      actualPrompts.task_1?.system_prompt !== scenarioPrompt
    )
      throw new Error(
        "Provisioned caller configuration differs from the captured authorized configuration",
      );
    return { agentId: callerId, config, prompts };
  }
  async reconcileProvisionedCaller(
    snapshotInput: RuntimeSnapshot,
    runId: string,
    onProvisioned?: (agentId: string) => Promise<void>,
  ): Promise<{ agentId: string } | null> {
    const snapshot = validateRuntimeSnapshot(snapshotInput);
    z.string().uuid().parse(runId);
    const candidates = (await this.listAgents()).filter(
      (agent) => agent.agent_name === `Vouch ${runId}`,
    );
    if (candidates.length > 1)
      throw new Error(
        "Multiple isolated callers match this run and require operator reconciliation",
      );
    const candidate = candidates[0];
    if (!candidate) return null;
    const agentId = providerIdSchema.parse(candidate.id);
    const actual = record(
      await this.request(`/v2/agent/${encodeURIComponent(agentId)}`),
      "reconciled caller document",
    );
    const config = record(
      actual.agent_config,
      "reconciled caller configuration",
    );
    const bounded = boundedAgent(config, snapshot.maxDurationSeconds);
    const task = z.array(bolnaDocument).length(1).parse(config.tasks)[0];
    const timing = record(task.task_config, "reconciled caller timing");
    if (
      config.agent_name !== `Vouch ${runId}` ||
      canonicalJson(bounded.agentConfig) !==
        canonicalJson(snapshot.agentConfig) ||
      timing.call_terminate !== Math.max(1, snapshot.maxDurationSeconds - 3)
    )
      throw new Error(
        "The reconciled caller does not match this run's captured resource controls",
      );
    if (onProvisioned) await onProvisioned(agentId);
    return { agentId };
  }
  private async authorizeStart(input: StartInput) {
    assertLiveEnabled();
    const parsed = startSchema.parse(input);
    const expectedConfiguration = validateRuntimeSnapshot(
      input.expectedConfiguration,
    );
    if (
      expectedConfiguration.model !== parsed.expectedModel ||
      expectedConfiguration.maxDurationSeconds !== parsed.maxDurationSeconds
    )
      throw new Error(
        "Expected caller configuration differs from the authorized model or duration",
      );
    const current = record(
      await this.request(`/v2/agent/${encodeURIComponent(parsed.agentId)}`),
      "isolated caller preflight",
    );
    const currentConfig = record(
      current.agent_config,
      "isolated caller configuration",
    );
    const bounded = boundedAgent(currentConfig, parsed.maxDurationSeconds);
    const task = z.array(bolnaDocument).length(1).parse(currentConfig.tasks)[0];
    const timing = record(
      task.task_config,
      "isolated caller timing configuration",
    );
    const prompts = promptsSchema.parse(current.agent_prompts);
    if (
      currentConfig.agent_name !== `Vouch ${parsed.runId}` ||
      canonicalJson(bounded.agentConfig) !==
        canonicalJson(expectedConfiguration.agentConfig) ||
      prompts.task_1?.system_prompt !== parsed.expectedPrompt ||
      timing.call_terminate !== Math.max(1, parsed.maxDurationSeconds - 3)
    )
      throw new Error(
        "The isolated caller no longer matches the authorized run configuration",
      );
    if (input.authorizeDispatch) await input.authorizeDispatch();
    assertLiveEnabled();
    if (
      Date.parse(parsed.endsAt) - Date.now() <
      (parsed.maxDurationSeconds + 5) * 1000
    )
      throw new Error("The authorized window no longer has room for this call");
    const fromPhone = process.env.BOLNA_FROM_PHONE_NUMBER
      ? phoneSchema.parse(process.env.BOLNA_FROM_PHONE_NUMBER)
      : undefined;
    return { ...parsed, fromPhone };
  }
  async start(input: StartInput): Promise<{ providerExecutionId: string }> {
    let parsed: z.infer<typeof startSchema> & { fromPhone?: string };
    try {
      parsed = await this.authorizeStart(input);
    } catch (error) {
      throw new DispatchNotSubmittedError(
        error instanceof Error ? error.message : undefined,
      );
    }
    const submission = await this.request(
      "/call",
      {
        agent_id: parsed.agentId,
        recipient_phone_number: parsed.phone,
        ...(parsed.fromPhone ? { from_phone_number: parsed.fromPhone } : {}),
        user_data: {
          ...parsed.userData,
          vouch_run_id: parsed.runId,
          vouch_scenario: parsed.scenario,
        },
      },
      true,
    );
    const result = bolnaDocument.safeParse(submission);
    if (!result.success) throw new DispatchUnknownError();
    const id = result.data.execution_id ?? result.data.id;
    const executionId = providerIdSchema.safeParse(id);
    if (!executionId.success) throw new DispatchUnknownError();
    return { providerExecutionId: executionId.data };
  }
  async stopQueued(id: string) {
    providerIdSchema.parse(id);
    return this.request(`/call/${encodeURIComponent(id)}/stop`, {});
  }
  async setTelephonyLimit(
    snapshot: ExecutionSnapshot,
    input: { phone: string; maxDurationSeconds: number },
  ) {
    return new TwilioCallControl(this.options.dispatcher).setLimit(
      snapshot,
      input,
    );
  }
  async cancel(snapshot: ExecutionSnapshot, input: { phone: string }) {
    if (snapshot.terminal) return;
    // Queued stop cannot end ringing or active calls. Always use verified
    // telephony control once the call SID is available.
    if (snapshot.telephonyCallId)
      return new TwilioCallControl(this.options.dispatcher).cancel(
        snapshot,
        input,
      );
    if (snapshot.status === "queued") return this.stopQueued(snapshot.id);
    throw new Error(
      "The active call has no correlated Twilio SID. Reconciliation is required.",
    );
  }
  async findExecution(input: {
    agentId: string;
    runId: string;
    from: string;
    to?: string;
  }): Promise<ExecutionSnapshot | null> {
    providerIdSchema.parse(input.agentId);
    z.string().uuid().parse(input.runId);
    const from = z.iso.datetime().parse(input.from);
    const to = z.iso.datetime().parse(input.to ?? new Date().toISOString());
    const fromMs = Date.parse(from);
    if (Date.parse(to) - fromMs > 7 * 86400000 || Date.parse(to) < fromMs)
      throw new Error(
        "Provider reconciliation requires a date range of at most seven days",
      );
    const query = new URLSearchParams({
      from,
      to,
      page_number: "1",
      page_size: "100",
    });
    const page = record(
      await this.request(
        `/v2/agent/${encodeURIComponent(input.agentId)}/executions?${query}`,
      ),
      "execution page",
    );
    if (page.has_more === true)
      throw new Error(
        "Isolated caller has too many executions for automatic reconciliation",
      );
    const items = z.array(bolnaDocument).parse(page.data);
    const matches: ExecutionSnapshot[] = [];
    for (const item of items) {
      if (typeof item.id !== "string") continue;
      const snapshot = await this.executionSnapshot(item.id);
      if (snapshot.correlationRunId === input.runId) matches.push(snapshot);
    }
    if (matches.length > 1)
      throw new Error(
        "Multiple executions match the run and require manual reconciliation",
      );
    return matches[0] ?? null;
  }
  async deleteProvisionedAgent(id: string, runId: string) {
    providerIdSchema.parse(id);
    z.string().uuid().parse(runId);
    if (!id || id === process.env.BOLNA_AGENT_ID)
      throw new Error("The base caller template cannot be deleted");
    let agent: ProviderDocument;
    try {
      agent = record(
        await this.request(`/v2/agent/${encodeURIComponent(id)}`),
        "caller ownership document",
      );
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404)
        return { deleted: true };
      throw error;
    }
    const config = record(agent.agent_config, "caller ownership configuration");
    if (config.agent_name !== `Vouch ${runId}`)
      throw new Error("Only the isolated caller for this run can be deleted");
    try {
      return await this.request(
        `/v2/agent/${encodeURIComponent(id)}`,
        undefined,
        false,
        "DELETE",
      );
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404)
        return { deleted: true };
      throw error;
    }
  }
}
