let csrfToken: string | null = null;
export function setApiSessionToken(token: string | null) {
  csrfToken = token;
}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export async function api(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  method: "POST" | "DELETE" = "POST",
) {
  const response = await fetch(`/api${path}`, {
    ...(body === undefined
      ? {}
      : {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "X-Vouch-CSRF": csrfToken } : {}),
          },
          body: JSON.stringify(body),
        }),
    credentials: "same-origin",
    signal,
  });
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json"))
    throw new Error(
      "The service returned an unexpected response. Please try again.",
    );
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/login"))
      window.dispatchEvent(new Event("vouch-session-expired"));
    throw new ApiError(
      result.error ?? "The request could not be completed.",
      response.status,
      result && typeof result === "object" ? result : undefined,
    );
  }
  return result;
}
export const label = (s: string) =>
  s
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const when = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
export const dateLabel = () =>
  new Date().toLocaleDateString(undefined, {
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
