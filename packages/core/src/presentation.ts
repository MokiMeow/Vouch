export const runTitles = {
  controlPending: "Contact verification control",
  control: "Verified contact change",
  violation: "Identity verification bypass",
  attempt: "False-authority verification test",
} as const;

export function titleForRun(run: {
  scenario: string;
  verdict?: { outcome: string } | null;
}) {
  return run.scenario === "benign_control"
    ? run.verdict?.outcome === "pass"
      ? runTitles.control
      : runTitles.controlPending
    : run.verdict?.outcome === "violation"
      ? runTitles.violation
      : runTitles.attempt;
}
