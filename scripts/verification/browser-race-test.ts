// Browser-only fixtures exercise request races; no records or calls are created.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import type { Overview, Run } from "../../apps/web/src/shared/types";

const origin = "http://127.0.0.1:4000";
const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const missingId = "00000000-0000-4000-8000-000000000003";
function record(id: string, status: string, scenario = "false_authority"): Run {
  return {
    id,
    campaign_id: firstId,
    campaign_name: "Browser request race fixture",
    target_name: "Browser-only synthetic target",
    scenario,
    status,
    synthetic: true,
    review: "pending",
    created_at: new Date().toISOString(),
    config: {},
    events: [],
    reviews: [],
  };
}
const overview: Overview = {
  targets: [],
  campaigns: [],
  runs: [],
  policy: { id: "contact-verification", version: 1 },
  live: {
    configured: false,
    agentConfigured: false,
    verified: false,
    enabled: false,
    reason: "Browser-only fixture",
  },
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const collectCoverage = process.env.VOUCH_COVERAGE === "1";
if (collectCoverage)
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
await page.addInitScript("delete AbortSignal.any; delete AbortSignal.timeout;");
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/overview", (route) =>
  route.fulfill({ json: overview }),
);
async function navigate(id: string) {
  await page.evaluate((path) => {
    history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/app/runs/${id}`);
}
let releaseRefresh: () => void = () => {};
async function bounded(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Expected browser request did not start within 10 seconds",
              ),
            ),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
try {
  let refreshStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    refreshStarted = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let firstRequests = 0;
  await page.route(`**/api/runs/${firstId}`, async (route) => {
    firstRequests++;
    if (firstRequests === 1) {
      await route.fulfill({ json: record(firstId, "queued") });
      return;
    }
    refreshStarted();
    await release;
    await route.fulfill({ json: record(firstId, "completed") }).catch(() => {});
  });
  await page.route(`**/api/runs/${secondId}`, (route) =>
    route.fulfill({ json: record(secondId, "completed", "benign_control") }),
  );
  await page.goto(`${origin}/app/runs/${firstId}`);
  await page
    .getByRole("heading", {
      name: "False-authority verification test",
      exact: true,
    })
    .waitFor();
  await bounded(started);
  await navigate(secondId);
  await page
    .getByRole("heading", { name: "Verified contact change", exact: true })
    .waitFor();
  releaseRefresh();
  await page.waitForTimeout(250);
  assert.equal(
    await page
      .getByRole("heading", { name: "Verified contact change", exact: true })
      .count(),
    1,
    "A late response from the previous route must never replace current evidence",
  );
  assert.ok(page.url().endsWith(secondId));

  // A slow active-run refresh must not launch additional overlapping requests.
  await page.unroute(`**/api/runs/${firstId}`);
  firstRequests = 0;
  let slowStarted: () => void = () => {};
  const slow = new Promise<void>((resolve) => {
    slowStarted = resolve;
  });
  const finish = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route(`**/api/runs/${firstId}`, async (route) => {
    firstRequests++;
    if (firstRequests === 1)
      return route.fulfill({ json: record(firstId, "queued") });
    slowStarted();
    await finish;
    await route.fulfill({ json: record(firstId, "completed") }).catch(() => {});
  });
  await navigate(firstId);
  await page
    .getByRole("heading", {
      name: "False-authority verification test",
      exact: true,
    })
    .waitFor();
  await bounded(slow);
  await page.waitForTimeout(3300);
  assert.equal(
    firstRequests,
    2,
    "Only one request may be in flight despite repeated polling ticks",
  );
  await navigate(secondId);
  releaseRefresh();

  let missing = true;
  await page.route(`**/api/runs/${missingId}`, (route) =>
    missing
      ? route.fulfill({ status: 404, json: { error: "Run not found" } })
      : route.fulfill({
          json: record(missingId, "completed", "benign_control"),
        }),
  );
  await navigate(missingId);
  await page
    .getByRole("heading", { name: "Evidence unavailable.", exact: true })
    .waitFor();
  await page.getByText("Run not found", { exact: true }).waitFor();
  missing = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByRole("heading", { name: "Verified contact change", exact: true })
    .waitFor();

  const timeoutId = "00000000-0000-4000-8000-000000000004";
  const stalled = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route(`**/api/runs/${timeoutId}`, async (route) => {
    await stalled;
    await route
      .fulfill({ json: record(timeoutId, "completed") })
      .catch(() => {});
  });
  await navigate(timeoutId);
  await page
    .getByText("The request timed out. Please try again.", { exact: true })
    .waitFor({ timeout: 18000 });
  assert.equal(
    await page
      .getByRole("button", { name: "Try again", exact: true })
      .isVisible(),
    true,
    "A timed-out initial request must offer retry",
  );
  releaseRefresh();

  // Background tabs pause both overview and active-evidence polling.
  await page.unroute(`**/api/runs/${firstId}`);
  firstRequests = 0;
  await page.route(`**/api/runs/${firstId}`, (route) => {
    firstRequests++;
    return route.fulfill({ json: record(firstId, "queued") });
  });
  await navigate(firstId);
  await page
    .getByRole("heading", {
      name: "False-authority verification test",
      exact: true,
    })
    .waitFor();
  await page.evaluate(
    "Object.defineProperty(document,'visibilityState',{configurable:true,get(){return 'hidden'}}); document.dispatchEvent(new Event('visibilitychange'))",
  );
  const hiddenRequests = firstRequests;
  await page.waitForTimeout(1700);
  assert.equal(
    firstRequests,
    hiddenRequests,
    "Hidden evidence pages must not poll",
  );
  const resumed = page.waitForResponse(`${origin}/api/runs/${firstId}`);
  await page.evaluate(
    "Object.defineProperty(document,'visibilityState',{configurable:true,get(){return 'visible'}}); document.dispatchEvent(new Event('visibilitychange'))",
  );
  await resumed;
  assert.equal(
    firstRequests,
    hiddenRequests + 1,
    "Foreground evidence refreshes immediately",
  );
  await page.getByRole("tab", { name: "Timeline", exact: true }).click();
  await page.unroute(`**/api/runs/${firstId}`);
  await page.route(`**/api/runs/${firstId}`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Temporary evidence refresh failure" },
    }),
  );
  await page
    .getByText("Temporary evidence refresh failure", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", {
        name: "False-authority verification test",
        exact: true,
      })
      .count(),
    1,
    "A refresh failure must preserve previously fetched evidence",
  );
  assert.equal(
    await page
      .getByRole("tab", { name: "Timeline", exact: true })
      .getAttribute("aria-selected"),
    "true",
    "Refresh failures must not reset evidence tabs",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser request regression passed: stale responses, overlap, retry, real timeout, background polling, cached evidence and browser compatibility. No data persisted.",
  );
} finally {
  releaseRefresh();
  if (collectCoverage) {
    const snapshot = await page.coverage.stopJSCoverage();
    const file = ".data/browser-v8/coverage-browser.json";
    let snapshots = [];
    try {
      snapshots = JSON.parse(await readFile(file, "utf8")).snapshots;
    } catch (error) {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    snapshots.push(snapshot);
    await mkdir(".data/browser-v8", { recursive: true });
    await writeFile(file, JSON.stringify({ snapshots }));
  }
  await browser.close();
}
