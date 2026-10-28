import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api } from "../lib";
import type { Overview, Run } from "../types";

type Snapshot<T> = { key: string | null; data: T | null; error: string };
type PendingRequest = { controller: AbortController; promise: Promise<void> };
type Lifecycle = { path: string | null; pending: PendingRequest | null };
type Publish<T> = Dispatch<SetStateAction<Snapshot<T>>>;

function requestMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

function isCurrent(
  lifecycle: Lifecycle,
  path: string,
  controller: AbortController,
) {
  return (
    lifecycle.path === path && lifecycle.pending?.controller === controller
  );
}
async function receiveData<T>(
  lifecycle: Lifecycle,
  path: string,
  controller: AbortController,
  publish: Publish<T>,
  onError?: (message: string) => void,
) {
  try {
    const data = await requestData<T>(path, controller);
    if (isCurrent(lifecycle, path, controller))
      publish({ key: path, data, error: "" });
  } catch (error) {
    if (!isCurrent(lifecycle, path, controller)) return;
    const message = requestMessage(error);
    publish((previous) => ({ ...previous, error: message }));
    onError?.(message);
  } finally {
    if (isCurrent(lifecycle, path, controller)) lifecycle.pending = null;
  }
}
function refreshData<T>(
  lifecycle: Lifecycle,
  path: string | null,
  publish: Publish<T>,
  onError?: (message: string) => void,
): Promise<void> {
  if (!path || lifecycle.path !== path) return Promise.resolve();
  if (lifecycle.pending) return lifecycle.pending.promise;
  const controller = new AbortController();
  publish((previous) => ({ ...previous, error: "" }));
  const promise = receiveData(lifecycle, path, controller, publish, onError);
  lifecycle.pending = { controller, promise };
  return promise;
}
function cancelData(lifecycle: Lifecycle) {
  lifecycle.path = null;
  lifecycle.pending?.controller.abort();
  lifecycle.pending = null;
}

async function requestData<T>(
  path: string,
  controller: AbortController,
): Promise<T> {
  // AbortController also supports browsers without AbortSignal.any/timeout.
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await api(path, undefined, controller.signal);
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("The request timed out. Please try again.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function useApiData<T>(
  path: string | null,
  onError?: (message: string) => void,
) {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({
    key: path,
    data: null,
    error: "",
  });
  const lifecycle = useRef<Lifecycle>({ path, pending: null });
  const refresh = useCallback(
    () => refreshData(lifecycle.current, path, setSnapshot, onError),
    [path, onError],
  );
  const reload = useCallback(async () => {
    // A post-mutation refresh must begin after any older request has settled.
    await lifecycle.current.pending?.promise;
    await refresh();
  }, [refresh]);
  useEffect(() => {
    const current = lifecycle.current;
    current.path = path;
    setSnapshot({ key: path, data: null, error: "" });
    void refresh();
    return () => cancelData(current);
  }, [path, refresh]);
  return {
    data: snapshot.key === path ? snapshot.data : null,
    error: snapshot.key === path ? snapshot.error : "",
    refresh,
    reload,
  };
}

function usePolling(
  refresh: () => Promise<void>,
  enabled: boolean,
  interval: number,
) {
  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const timer = setInterval(update, interval);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [enabled, interval, refresh]);
}

export function useOverview(onError: (message: string) => void) {
  const resource = useApiData<Overview>("/overview", onError);
  const active =
    resource.data?.runs.some(
      (run) => run.status === "queued" || run.status === "running",
    ) ?? true;
  usePolling(resource.refresh, true, active ? 2500 : 30000);
  return { ...resource, refresh: resource.reload };
}

export function useEvidence(path: string) {
  const runId = path.startsWith("/app/runs/") ? path.split("/")[3] : null;
  const resource = useApiData<Run>(runId ? `/runs/${runId}` : null);
  const active =
    resource.data?.status === "queued" || resource.data?.status === "running";
  usePolling(resource.refresh, active, 1500);
  return {
    run: resource.data,
    runId,
    error: resource.error,
    refresh: resource.reload,
  };
}
