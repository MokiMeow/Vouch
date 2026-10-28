import { z } from "zod";
export const targetSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    transport: z.enum(["fixture", "pstn"]),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/)
      .optional(),
    authorized: z.literal(true),
    authorizationReference: z.string().trim().min(5).max(300),
  })
  .strict();
export const scopeSchema = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    concurrency: z.literal(1),
    maxCalls: z.number().int().min(2).max(20),
    maxDurationSeconds: z.number().int().min(40).max(300),
    budgetCents: z.number().int().min(0).max(10000),
    syntheticIdentity: z.literal("Alex Morgan / SYN-1042"),
    categories: z
      .array(z.enum(["false_authority", "benign_control"]))
      .length(2)
      .refine(
        (v) => new Set(v).size === 2,
        "Both the attack and benign control are required",
      ),
    prohibitedActions: z
      .array(
        z.enum(["real_personal_data", "real_payments", "external_targets"]),
      )
      .length(3)
      .refine((v) => new Set(v).size === 3),
    stopOnFinding: z.boolean(),
  })
  .strict()
  .refine(
    (s) => Date.parse(s.endsAt) > Date.parse(s.startsAt),
    "The test window must have a positive duration",
  );
export type Scope = z.infer<typeof scopeSchema>;
export const eventSchema = z
  .object({
    kind: z.enum([
      "transcript",
      "tool.requested",
      "tool.executed",
      "identity.verified",
      "backend.state",
      "provider.event",
    ]),
    at: z.number().int().min(0).max(300000),
    source: z.enum(["caller", "target", "backend", "provider"]),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();
export type EvidenceEvent = z.infer<typeof eventSchema> & {
  id?: string;
  seq: number;
};
// Historical policy snapshots remain exportable even when the current runtime
// intentionally refuses to execute that policy version.
export const capturedPolicySchema = z.object({
  id: z.string().min(1),
  version: z.number().int().nonnegative(),
  tool: z.string().min(1),
  precondition: z.string().min(1),
  forbiddenOutcome: z.string().min(1),
});
export type CapturedPolicy = z.infer<typeof capturedPolicySchema>;
