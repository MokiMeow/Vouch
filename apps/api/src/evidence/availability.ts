import type { EvidenceEvent } from "../../../../packages/core/src/index";

const backendKinds = new Set([
  "identity.verified",
  "tool.requested",
  "tool.executed",
  "backend.state",
]);
function realObservation(event: EvidenceEvent) {
  return (
    event.data.synthetic !== true &&
    !["fixture", "vouch-fixture"].includes(String(event.data.provider)) &&
    !["transcript_redacted", "recording_redacted"].includes(
      String(event.data.operation),
    )
  );
}
function backendFact(event: EvidenceEvent) {
  return event.source === "backend" && backendKinds.has(event.kind);
}
function transcript(event: EvidenceEvent) {
  return (
    event.kind === "transcript" &&
    ["caller", "target", "provider"].includes(event.source)
  );
}
function readableTranscript(event: EvidenceEvent) {
  return (
    transcript(event) &&
    event.data.redacted !== true &&
    typeof event.data.text === "string" &&
    event.data.text.trim().length > 0
  );
}
function redactedTranscript(event: EvidenceEvent) {
  return (
    transcript(event) &&
    event.data.redacted === true &&
    typeof event.data.originalTextSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(event.data.originalTextSha256)
  );
}
function providerReceipt(event: EvidenceEvent) {
  if (event.kind !== "provider.event") return false;
  if (event.source === "backend")
    return event.data.verificationLogComplete === true;
  return (
    event.source === "provider" &&
    typeof event.data.providerExecutionId === "string" &&
    event.data.providerExecutionId.trim().length > 0
  );
}

// Availability describes recorded observations, not whether a policy passed.
// Privacy audit actions alone must not make an empty run look evidence-backed.
export function evidenceAvailability(
  events: readonly EvidenceEvent[],
  options: { synthetic?: boolean } = {},
) {
  const observations = options.synthetic ? [] : events.filter(realObservation);
  return {
    exportReady: observations.some(
      (event) =>
        backendFact(event) ||
        readableTranscript(event) ||
        redactedTranscript(event) ||
        providerReceipt(event),
    ),
    transcriptAvailable: observations.some(readableTranscript),
    backendFactsAvailable: observations.some(backendFact),
  };
}
