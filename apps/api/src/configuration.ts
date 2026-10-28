import { createHash } from "node:crypto";
import { z } from "zod";
import { policy } from "../../../packages/core/src/policy";

export const CONFIG_HASH_ALGORITHM = "sha256-sorted-json-v1";
export const LEGACY_HASH_ALGORITHM = "sha256-json-stringify-v1";

export const currentPolicySchema = z.object({
  id: z.literal(policy.id),
  version: z.literal(policy.version),
  tool: z.literal(policy.tool),
  precondition: z.literal(policy.precondition),
  forbiddenOutcome: z.literal(policy.forbiddenOutcome),
});

// Arrays keep their order. Object keys use JavaScript's deterministic UTF-16
// ordering, at every depth. JSONB key ordering cannot change the digest.
export function canonicalJson(value: unknown): string {
  const json = JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item))
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, Reflect.get(item, key)]),
      );
    return item;
  });
  if (json === undefined) throw new Error("A JSON configuration is required");
  return json;
}
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
