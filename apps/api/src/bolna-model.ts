import type { Response } from "undici";
import { z } from "zod";

export const bolnaDocument = z.record(z.string(), z.unknown());
export type ProviderDocument = z.infer<typeof bolnaDocument>;
export type ExecutionStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled" | "unknown";
export type ExecutionSnapshot = {
  id: string;
  status: ExecutionStatus;
  providerStatus: string;
  terminal: boolean;
  transcript: string | null;
  recordingUrl: string | null;
  durationSeconds: number | null;
  costCents: number | null;
  costFinalized: boolean;
  telephonyCallId: string | null;
  targetPhone: string | null;
  agentId: string | null;
  correlationRunId: string | null;
  raw: ProviderDocument;
};

function nonnegative(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null;
  return value;
}
function lifecycle(value: string): ExecutionStatus {
  switch (value.toLowerCase()) {
    case "queued":
    case "scheduled":
    case "initiated":
      return "queued";
    case "ringing":
    case "in-progress":
    case "in_progress":
    case "ongoing":
      return "running";
    case "completed":
      return "completed";
    case "canceled":
    case "cancelled":
    case "stopped":
      return "cancelled";
    case "failed":
    case "busy":
    case "no-answer":
    case "no_answer":
    case "balance-low":
      return "failed";
    default:
      return "unknown";
  }
}
export type CostContract = {
  unit: "cents" | "usd" | "unknown";
  currency: "USD" | "unknown";
  finalCostVerified: boolean;
};
export function currentCostContract(): CostContract {
  const configured = process.env.BOLNA_COST_UNIT;
  return {
    unit:
      configured === "cents" || configured === "usd" ? configured : "unknown",
    currency: process.env.BOLNA_COST_CURRENCY === "USD" ? "USD" : "unknown",
    finalCostVerified: process.env.BOLNA_FINAL_COST_VERIFIED === "true",
  };
}
export function normalizeExecution(
  id: string,
  raw: ProviderDocument,
  costContract: CostContract = currentCostContract(),
): ExecutionSnapshot {
  const providerStatus =
    typeof raw.status === "string" ? raw.status : "unknown";
  const status = lifecycle(providerStatus);
  const terminal = ["completed", "failed", "cancelled"].includes(status);
  const telephony = bolnaDocument.safeParse(raw.telephony_data);
  const data = telephony.success ? telephony.data : {};
  const sid = typeof data.call_sid === "string" ? data.call_sid : null;
  const userData = bolnaDocument.safeParse(raw.user_data);
  const cost = nonnegative(raw.cost);
  const unit = costContract.unit;
  const knownCurrency = costContract.currency === "USD";
  // Never guess currency or units from a provider-shaped numeric field.
  const costCents =
    cost !== null && knownCurrency && (unit === "cents" || unit === "usd")
      ? Math.ceil(unit === "usd" ? cost * 100 : cost)
      : null;
  return {
    id,
    status,
    providerStatus,
    terminal,
    transcript: typeof raw.transcript === "string" ? raw.transcript : null,
    recordingUrl:
      typeof raw.recording_url === "string" ? raw.recording_url : null,
    durationSeconds: nonnegative(raw.conversation_duration),
    costCents:
      costCents !== null && Number.isSafeInteger(costCents) ? costCents : null,
    costFinalized:
      terminal &&
      costCents !== null &&
      Number.isSafeInteger(costCents) &&
      costContract.finalCostVerified,
    telephonyCallId: sid && /^CA[0-9a-f]{32}$/i.test(sid) ? sid : null,
    targetPhone: typeof data.to_number === "string" ? data.to_number : null,
    agentId: typeof raw.agent_id === "string" ? raw.agent_id : null,
    correlationRunId:
      userData.success && typeof userData.data.vouch_run_id === "string"
        ? userData.data.vouch_run_id
        : null,
    raw: {
      ...(typeof raw.id === "string" ? { id: raw.id } : {}),
      ...(typeof raw.execution_id === "string"
        ? { execution_id: raw.execution_id }
        : {}),
    },
  };
}

export async function readProviderJson(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const advertised = Number(response.headers.get("content-length"));
  if (advertised > maxBytes) {
    await response.body?.cancel();
    throw new Error("Provider document exceeds the size limit");
  }
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks: Buffer[] = [];
  let length = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error("Provider document exceeds the size limit");
    }
    chunks.push(Buffer.from(part.value));
  }
  return length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
