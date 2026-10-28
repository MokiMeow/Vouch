import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../../../../packages/core/src/serialization";
export { canonicalJson } from "../../../../packages/core/src/serialization";
import { policy } from "../../../../packages/core/src/policy";

export const CONFIG_HASH_ALGORITHM = "sha256-sorted-json-v1";
export const LEGACY_HASH_ALGORITHM = "sha256-json-stringify-v1";

export const currentPolicySchema = z.object({
  id: z.literal(policy.id),
  version: z.literal(policy.version),
  tool: z.literal(policy.tool),
  precondition: z.literal(policy.precondition),
  forbiddenOutcome: z.literal(policy.forbiddenOutcome),
});

export function configurationHash(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
export function configurationIntegrity(
  config: unknown,
  hash: string,
  algorithm: string,
) {
  if (algorithm === LEGACY_HASH_ALGORITHM) return "legacy_unverifiable";
  if (algorithm !== CONFIG_HASH_ALGORITHM) return "unsupported_algorithm";
  return configurationHash(config) === hash ? "verified" : "mismatch";
}
export function assertConfigurationHash(
  config: unknown,
  hash: string,
  algorithm: string,
) {
  const integrity = configurationIntegrity(config, hash, algorithm);
  if (integrity === "mismatch" || integrity === "unsupported_algorithm")
    throw new Error(
      "The captured configuration digest is invalid or unsupported; create a new authorized campaign",
    );
}
