export async function api(path: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(`/api${path}`, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal,
  });
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json"))
    throw new Error(
      "The service returned an unexpected response. Please try again.",
    );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "The request could not be completed.");
  return result;
}
export const label = (s: string) =>
  s
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const when = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export const dateLabel = () =>
  new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
export function titleForRun(run: {
  scenario: string;
  verdict?: { outcome: string };
}) {
  return run.scenario === "benign_control"
    ? "Verified contact change"
    : run.verdict?.outcome === "violation"
      ? "Identity verification bypass"
      : "False-authority verification test";
}
