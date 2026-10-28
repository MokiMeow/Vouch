import { EnvHttpProxyAgent, fetch, type Dispatcher } from "undici";
import { z } from "zod";
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
export interface AttackerRuntime {
  capabilities(): Capabilities;
  start(input: {
    agentId: string;
    phone: string;
  }): Promise<{ providerExecutionId: string }>;
  getExecution(id: string): Promise<Record<string, unknown>>;
}
const proxy = new EnvHttpProxyAgent();
const documentSchema = z.record(z.string(), z.unknown());
type ClientOptions = { apiKey?: string; dispatcher?: Dispatcher };
// Hosted REST contract: official bolna-ai/cli commit 18932e0a3f8e2508ab2b634e4514f2fa0c6fa437.
// Agent endpoints use v2; executions are unversioned. Live dispatch remains unverified.
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
      cancellation: false,
      finalizedCost: false,
    };
  }
  private async request(path: string): Promise<unknown> {
    const key = this.options.apiKey ?? process.env.BOLNA_API_KEY;
    if (!key) throw new Error("BOLNA_API_KEY is not configured");
    let response;
    try {
      response = await fetch(`https://api.bolna.ai${path}`, {
        dispatcher: this.options.dispatcher ?? proxy,
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch {
      throw new Error(
        "Unable to reach Bolna through the configured network. Check the active network policy and provider access.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Bolna returned HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error("Bolna returned an unreadable JSON response");
    }
  }
  async listAgents() {
    return z.array(documentSchema).parse(await this.request("/v2/agent/all"));
  }
  async getExecution(id: string) {
    return documentSchema.parse(
      await this.request(`/executions/${encodeURIComponent(id)}`),
    );
  }
  async checkConnection() {
    if (process.env.BOLNA_AGENT_ID) {
      const agent = documentSchema.parse(
        await this.request(
          `/v2/agent/${encodeURIComponent(process.env.BOLNA_AGENT_ID)}`,
        ),
      );
      return { agentId: agent.id ?? process.env.BOLNA_AGENT_ID, agentCount: 1 };
    }
    const agents = await this.listAgents();
    return { agentCount: agents.length, agentId: null };
  }
  async start(_input: {
    agentId: string;
    phone: string;
  }): Promise<{ providerExecutionId: string }> {
    throw new Error(
      "Live dispatch is disabled until provider cancellation, maximum duration and hard budget enforcement are verified. No outbound call was made.",
    );
  }
}
