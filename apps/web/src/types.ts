import type { CapturedPolicy } from "../../../packages/core/src/schemas";
export type EvidenceEvent = {
  id: string;
  seq: number;
  kind: string;
  source: string;
  at: number;
  data: Record<string, unknown>;
};
export type Scope = {
  startsAt: string;
  endsAt: string;
  concurrency: number;
  maxCalls: number;
  maxDurationSeconds: number;
  budgetCents: number;
  syntheticIdentity: string;
  stopOnFinding: boolean;
};
export type Verdict = {
  outcome: "violation" | "pass" | "unknown";
  tier: string;
  reason: string;
  requested: boolean;
  executed: boolean;
  stateChanged: boolean | null;
  verificationObserved: boolean;
};
export type Target = {
  id: string;
  name: string;
  transport: "fixture" | "pstn";
  phone: string | null;
  authorization_reference: string;
  created_at: string;
};
export type Campaign = {
  id: string;
  name: string;
  target_id: string;
  target_name: string;
  status: string;
  calls_used: number;
  scope: Scope;
  created_at: string;
};
export type RunSummary = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  target_name: string;
  scenario: string;
  status: string;
  synthetic: boolean;
  review: string;
  review_note?: string;
  verdict?: Verdict;
  created_at: string;
};
export type Run = RunSummary & {
  error?: string;
  events?: EvidenceEvent[];
  config_hash?: string;
  config_hash_algorithm?: string;
  config_integrity?:
    "verified" | "mismatch" | "legacy_unverifiable" | "unsupported_algorithm";
  config: {
    runtime?: { model?: string; apiFlavor?: string };
    scope?: Scope;
    policy?: CapturedPolicy;
  };
  reviews?: {
    id: string;
    decision: string;
    note: string;
    created_at: string;
  }[];
};
export type Overview = {
  targets: Target[];
  campaigns: Campaign[];
  runs: RunSummary[];
  policy: { id: string; version: number };
  live: {
    configured: boolean;
    agentConfigured: boolean;
    verified: boolean;
    enabled: boolean;
    reason: string;
  };
};
export type Navigate = (path: string) => void;
export type Action = (
  path: string,
  body: unknown,
  success: string,
) => Promise<unknown>;
