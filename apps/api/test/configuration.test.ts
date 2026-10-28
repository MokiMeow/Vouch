import { describe, expect, it } from "vitest";
import {
  CONFIG_HASH_ALGORITHM,
  LEGACY_HASH_ALGORITHM,
  assertConfigurationHash,
  canonicalJson,
  configurationHash,
  configurationIntegrity,
} from "../src/campaigns/configuration";

describe("configuration provenance", () => {
  it("uses the documented UTF-16 key order rather than locale-dependent sorting", () => {
    expect(canonicalJson({ á: 1, a: 2, "a-": 3, Z: 4 })).toBe(
      '{"Z":4,"a":2,"a-":3,"á":1}',
    );
  });
  it("produces the same digest after a JSONB-style object reorder at every depth", () => {
    const captured = {
      version: 1,
      scope: { maxCalls: 4, budgetCents: 0 },
      scenarios: ["benign", "attack"],
    };
    const restored = {
      scenarios: ["benign", "attack"],
      scope: { budgetCents: 0, maxCalls: 4 },
      version: 1,
    };
    expect(configurationHash(captured)).toBe(configurationHash(restored));
    expect(canonicalJson(restored)).toBe(
      '{"scenarios":["benign","attack"],"scope":{"budgetCents":0,"maxCalls":4},"version":1}',
    );
  });
  it("keeps the order of scenarios significant", () => {
    expect(configurationHash({ scenarios: ["control", "attack"] })).not.toBe(
      configurationHash({ scenarios: ["attack", "control"] }),
    );
  });
  it("detects a changed captured configuration without rewriting its digest", () => {
    const config = { scope: { maxCalls: 4 } };
    const digest = configurationHash(config);
    expect(configurationIntegrity(config, digest, CONFIG_HASH_ALGORITHM)).toBe(
      "verified",
    );
    const changed = { scope: { maxCalls: 20 } };
    expect(configurationIntegrity(changed, digest, CONFIG_HASH_ALGORITHM)).toBe(
      "mismatch",
    );
    expect(() =>
      assertConfigurationHash(changed, digest, CONFIG_HASH_ALGORITHM),
    ).toThrow("digest");
  });
  it("identifies historical key-order hashes as unverifiable instead of falsely marking them valid", () => {
    expect(
      configurationIntegrity({}, "historical-digest", LEGACY_HASH_ALGORITHM),
    ).toBe("legacy_unverifiable");
    expect(() =>
      assertConfigurationHash({}, "historical-digest", LEGACY_HASH_ALGORITHM),
    ).not.toThrow();
  });
  it("rejects unknown algorithms and missing JSON roots", () => {
    expect(configurationIntegrity({}, "digest", "unknown")).toBe(
      "unsupported_algorithm",
    );
    expect(() => assertConfigurationHash({}, "digest", "unknown")).toThrow(
      "unsupported",
    );
    expect(() => canonicalJson(undefined)).toThrow("JSON configuration");
  });
  it("accepts a digest that matches the complete captured configuration", () => {
    const config = { scope: { maxCalls: 4 }, optional: null };
    expect(() =>
      assertConfigurationHash(
        config,
        configurationHash(config),
        CONFIG_HASH_ALGORITHM,
      ),
    ).not.toThrow();
  });
});
