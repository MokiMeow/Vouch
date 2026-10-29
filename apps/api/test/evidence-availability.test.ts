import { describe, expect, it } from "vitest";
import type { EvidenceEvent } from "../../../packages/core/src/index";
import { evidenceAvailability } from "../src/evidence/availability";

const event = (
  kind: EvidenceEvent["kind"],
  source: EvidenceEvent["source"],
  data: EvidenceEvent["data"],
): EvidenceEvent => ({ kind, source, data, at: 0, seq: 1 });

describe("actual evidence availability", () => {
  it("keeps empty runs and privacy-only actions unavailable for export", () => {
    expect(evidenceAvailability([]).exportReady).toBe(false);
    expect(
      evidenceAvailability([
        event("provider.event", "provider", {
          operation: "transcript_redacted",
        }),
        event("provider.event", "provider", {
          operation: "recording_redacted",
        }),
      ]).exportReady,
    ).toBe(false);
  });

  it("requires actual provider identity rather than arbitrary claims", () => {
    expect(
      evidenceAvailability([
        event("provider.event", "caller", { providerExecutionId: "claim" }),
        event("provider.event", "provider", { status: "completed" }),
      ]).exportReady,
    ).toBe(false);
    expect(
      evidenceAvailability([
        event("provider.event", "provider", {
          providerExecutionId: "actual-receipt",
          status: "queued",
        }),
      ]).exportReady,
    ).toBe(true);
  });

  it("recognizes captured transcript text without inventing backend proof", () => {
    expect(
      evidenceAvailability([
        event("transcript", "provider", {
          text: "Captured provider transcript",
        }),
      ]),
    ).toEqual({
      exportReady: true,
      transcriptAvailable: true,
      backendFactsAvailable: false,
    });
    expect(
      evidenceAvailability([event("transcript", "provider", { text: "   " })])
        .exportReady,
    ).toBe(false);
  });

  it("preserves exportable redaction provenance without claiming readable text", () => {
    expect(
      evidenceAvailability([
        event("transcript", "provider", {
          text: "[Transcript redacted by workspace owner]",
          redacted: true,
          originalTextSha256: "a".repeat(64),
        }),
      ]),
    ).toEqual({
      exportReady: true,
      transcriptAvailable: false,
      backendFactsAvailable: false,
    });
  });

  it("admits trusted backend observations but rejects spoofed tool claims", () => {
    expect(
      evidenceAvailability([
        event("tool.executed", "caller", {
          tool: "change_contact_phone",
          success: true,
        }),
      ]).exportReady,
    ).toBe(false);
    expect(
      evidenceAvailability([
        event("tool.executed", "backend", {
          tool: "change_contact_phone",
          success: true,
        }),
      ]),
    ).toEqual({
      exportReady: true,
      transcriptAvailable: false,
      backendFactsAvailable: true,
    });
    expect(
      evidenceAvailability([
        event("provider.event", "backend", { verificationLogComplete: true }),
      ]).exportReady,
    ).toBe(true);
  });

  it("excludes historical synthetic runs and explicit fixture observations", () => {
    const receipt = event("provider.event", "provider", {
      providerExecutionId: "actual-receipt",
    });
    expect(
      evidenceAvailability([receipt], { synthetic: true }).exportReady,
    ).toBe(false);
    expect(
      evidenceAvailability([
        event("transcript", "target", {
          text: "Old demonstration",
          synthetic: true,
        }),
        event("provider.event", "provider", {
          providerExecutionId: "fixture-receipt",
          provider: "fixture",
        }),
      ]).exportReady,
    ).toBe(false);
  });
});
