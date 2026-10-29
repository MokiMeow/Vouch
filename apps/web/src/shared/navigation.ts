export function readView(location: string) {
  const url = new URL(location, "http://vouch.local");
  const n = Number(url.searchParams.get("page") ?? 1);
  const page = Number.isSafeInteger(n) && n >= 1 && n <= 20001 ? n : 1;
  const outcome = url.searchParams.get("outcome") ?? "all";
  return {
    page,
    search: (url.searchParams.get("q") ?? "").slice(0, 300),
    outcome: ["all", "violation", "pass", "unknown"].includes(outcome)
      ? outcome
      : "all",
  };
}
export function updateView(
  location: string,
  changes: { page?: number; search?: string; outcome?: string },
) {
  const url = new URL(location, "http://vouch.local");
  for (const [key, value] of Object.entries(changes)) {
    const param = key === "search" ? "q" : key;
    if (
      value === 1 ||
      value === "" ||
      value === "all" ||
      (key === "search" && String(value).trim() === "")
    )
      url.searchParams.delete(param);
    else url.searchParams.set(param, String(value));
  }
  return url.pathname + url.search;
}
export function runHref(
  id: string,
  from = window.location.pathname + window.location.search,
) {
  return `/app/runs/${id}?from=${encodeURIComponent(from)}`;
}
export function returnPath(location: string) {
  const from = new URL(location, "http://vouch.local").searchParams.get("from");
  return from && /^\/app(?:\/(?:campaigns|findings))?(?:\?[^#]*)?$/.test(from)
    ? from
    : "/app/findings";
}
