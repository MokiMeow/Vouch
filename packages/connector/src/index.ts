import { createHmac, randomUUID } from "node:crypto";
import { EnvHttpProxyAgent, fetch, type Dispatcher } from "undici";
import { z } from "zod";
import { canonicalJson } from "../../core/src/serialization";

const accountId = z.literal("SYN-1042");
const milliseconds = z.number().int().min(0).max(300000);
const backendEventBase = { source: z.literal("backend"), at: milliseconds };
const tool = z.literal("change_contact_phone");
export const backendEventSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...backendEventBase,
      kind: z.literal("identity.verified"),
      data: z
        .object({ accountId, method: z.literal("synthetic_challenge") })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...backendEventBase,
      kind: z.literal("tool.requested"),
      data: z
        .object({
          accountId,
          tool,
          arguments: z
            .object({ phone: z.string().min(1).max(80) })
            .strict()
            .optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...backendEventBase,
      kind: z.literal("tool.executed"),
      data: z.object({ accountId, tool, success: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      ...backendEventBase,
      kind: z.literal("backend.state"),
      data: z
        .object({
          accountId,
          before: z.string().max(1000),
          after: z.string().max(1000),
          observation: z.string().min(1).max(500).optional(),
        })
        .strict(),
    })
    .strict(),
]);
export type BackendEvent = z.infer<typeof backendEventSchema>;
const evidenceInputSchema = z
  .object({
    runId: z.uuid(),
    providerExecutionId: z.string().min(1).max(200),
    signingKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    batchId: z.uuid(),
    startSequence: z.number().int().min(1),
    events: z.array(backendEventSchema).max(128),
    complete: z
      .object({ totalEvents: z.number().int().nonnegative(), at: milliseconds })
      .strict()
      .optional(),
    timestamp: z
      .number()
      .int()
      .min(1000000000000)
      .max(9999999999999)
      .optional(),
    nonce: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,100}$/)
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (!input.events.length && !input.complete)
      ctx.addIssue({
        code: "custom",
        message: "Provide an observed event or a complete log marker",
        path: ["events"],
      });
    if (
      input.complete &&
      input.complete.totalEvents !==
        input.startSequence + input.events.length - 1
    )
      ctx.addIssue({
        code: "custom",
        message: "Completion count must cover the accepted stream sequence",
        path: ["complete", "totalEvents"],
      });
    if (
      input.complete &&
      input.events.some((event) => event.at > input.complete!.at)
    )
      ctx.addIssue({
        code: "custom",
        message: "Completion timestamp must cover every submitted observation",
        path: ["complete", "at"],
      });
    if (
      input.events.some(
        (event, index) => index > 0 && event.at < input.events[index - 1].at,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Backend observations must preserve chronological order",
        path: ["events"],
      });
  });
export type EvidenceBatchInput = z.input<typeof evidenceInputSchema>;
export type SignedEvidenceRequest = {
  path: string;
  headers: Record<string, string>;
  body: string;
};

/** Sign committed backend observations. This helper does not infer verification or tool success. */
export function createSignedEvidenceRequest(
  input: EvidenceBatchInput,
): SignedEvidenceRequest {
  const parsed = evidenceInputSchema.parse(input);
  const body = canonicalJson({
    batchId: parsed.batchId,
    providerExecutionId: parsed.providerExecutionId,
    startSequence: parsed.startSequence,
    events: parsed.events,
    ...(parsed.complete ? { complete: parsed.complete } : {}),
  });
  if (Buffer.byteLength(body, "utf8") > 500000)
    throw new Error("Evidence batch exceeds the supported request size");
  const timestamp = String(parsed.timestamp ?? Date.now());
  const nonce = parsed.nonce ?? randomUUID();
  const signature = createHmac("sha256", parsed.signingKey)
    .update(`${timestamp}\n${nonce}\n${body}`)
    .digest("hex");
  return {
    path: `/api/runs/${parsed.runId}/backend-events`,
    body,
    headers: {
      "content-type": "application/json",
      "x-vouch-timestamp": timestamp,
      "x-vouch-nonce": nonce,
      "x-vouch-signature": signature,
    },
  };
}
const acknowledgementSchema = z.object({
  accepted: z.number().int().nonnegative(),
  duplicate: z.boolean(),
  complete: z.boolean().optional(),
  nextSequence: z.number().int().positive().optional(),
});
export type EvidenceAcknowledgement = z.infer<typeof acknowledgementSchema>;
const proxy = new EnvHttpProxyAgent();
async function acknowledgementBody(
  response: Awaited<ReturnType<typeof fetch>>,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new Error("Oversized response");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function approvedOrigin(value: string) {
  const origin = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    origin.username ||
    origin.password ||
    origin.origin !== value ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && local))
  )
    throw new Error(
      "Evidence destination must be an explicit HTTPS origin or loopback HTTP origin",
    );
  return origin;
}
/** Sends once. Persist batch IDs and sequence in the customer outbox before calling. */
export async function sendEvidenceBatch(
  origin: string,
  input: EvidenceBatchInput,
  options: { timeoutMs?: number; dispatcher?: Dispatcher } = {},
): Promise<EvidenceAcknowledgement> {
  const base = approvedOrigin(origin);
  const timeoutMs = z
    .number()
    .int()
    .min(1000)
    .max(60000)
    .parse(options.timeoutMs ?? 15000);
  const request = createSignedEvidenceRequest(input);
  let response;
  try {
    response = await fetch(new URL(request.path, base), {
      method: "POST",
      headers: request.headers,
      body: request.body,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher: options.dispatcher ?? proxy,
    });
  } catch {
    throw new Error(
      "Evidence delivery outcome is unknown. Keep the durable batch and reconcile or redeliver the same batch identifier",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Evidence delivery failed with HTTP ${response.status}`);
  }
  try {
    const text = await acknowledgementBody(response);
    return acknowledgementSchema.parse(JSON.parse(text));
  } catch {
    throw new Error(
      "Evidence acknowledgement is unreadable. Keep the durable batch for reconciliation",
    );
  }
}
