// Intercepted browser-only workflow fixtures. No database/provider calls are made.
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { chromium } from "playwright";
import { z } from "zod";
import { scopeSchema } from "../../packages/core/src/schemas";
import type { SetupStatus } from "../../packages/core/src/setup";
import type {
  AuthSession,
  Overview,
  Run,
  Target,
} from "../../apps/web/src/shared/types";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target: Target = {
  id: id(1),
  name: "Browser-only approved target",
  transport: "pstn",
  phone: "+12025550199",
  authorization_reference: "Browser-only workflow regression",
  created_at: new Date().toISOString(),
};
const readySetup = (): SetupStatus => ({
  checkedAt: new Date().toISOString(),
  databaseReady: true,
  canRegisterTarget: true,
  liveConfigurationReady: true,
  checks: (
    [
      "database",
      "caller",
      "carrier",
      "authorization",
      "evidence",
      "billing",
      "dispatch",
      "worker",
    ] as const
  ).map((key) => ({
    id: key,
    title: key === "database" ? "Database connection" : `${key} configuration`,
    state: "ready",
    detail:
      key === "database"
        ? "Database verification now complete"
        : "Configuration ready for browser-only verification. No actual provider call verified.",
    fields: [],
    docsPath: "/docs/quickstart",
  })),
});
let setup = readySetup();
let overviewFails = false;
let prerequisitesBlocked = false;
let withCampaign = false;
let campaignStopped = false;
let campaignMode: "fail" | "hold" = "fail";
let releaseCampaign: () => void = () => {};
let campaignStarted: () => void = () => {};
let setupRequests = 0;
let stopRequests = 0;
let releaseStop: () => void = () => {};
let stopStarted: () => void = () => {};
const findingQueries: URLSearchParams[] = [];
const campaignBodies: unknown[] = [];
const unexpected: string[] = [];
const errors: string[] = [];
const accessibilityChecks: {
  screen: string;
  width: number;
  violations: {
    id: string;
    impact: string | null | undefined;
    nodes: { target: unknown; summary: string | undefined }[];
  }[];
}[] = [];
const session: AuthSession = {
  mode: "local",
  authenticated: true,
  user: null,
  workspace: { id: id(2), name: "Browser-only workflow", role: "owner" },
  workspaces: [],
  csrfToken: null,
};
const scope = {
  startsAt: new Date(Date.now() - 60000).toISOString(),
  endsAt: new Date(Date.now() + 3600000).toISOString(),
  concurrency: 1,
  maxCalls: 6,
  maxDurationSeconds: 90,
  budgetCents: 1234,
  syntheticIdentity: "Alex Morgan / SYN-1042",
  stopOnFinding: true,
};
const initialRun: Run = {
  id: id(3),
  campaign_id: id(4),
  campaign_name: "Reviewed workflow campaign",
  target_name: target.name,
  scenario: "benign_control",
  status: "queued",
  synthetic: false,
  review: "pending",
  created_at: new Date().toISOString(),
  campaign_status: "queued",
  calls_used: 2,
  remainingSlots: 4,
  exportReady: false,
  scope,
  config: { scope },
  events: [],
  reviews: [],
  artifacts: [],
  liveExecution: null,
  recording: { available: false },
};
const overview = (): Overview => ({
  targets: prerequisitesBlocked ? [] : [target],
  campaigns: withCampaign
    ? [
        {
          id: initialRun.campaign_id,
          name: initialRun.campaign_name,
          target_id: target.id,
          mode: "live",
          target_name: target.name,
          status: campaignStopped ? "stopped" : "running",
          calls_used: 2,
          scope,
          created_at: initialRun.created_at,
        },
      ]
    : [],
  runs: withCampaign ? [initialRun] : [],
  policy: { id: "contact-verification", version: 1 },
  live: {
    configured: !prerequisitesBlocked,
    agentConfigured: !prerequisitesBlocked,
    enabled: !prerequisitesBlocked,
    verified: false,
    reason: prerequisitesBlocked
      ? "Provider configuration must be completed before calls can launch."
      : "Test-only configuration ready. No real calls are made.",
  },
  summary: {
    campaigns: withCampaign ? 1 : 0,
    runs: 0,
    candidates: 0,
    backendVerified: 0,
    pendingFindings: 0,
    totalRuns: withCampaign ? 1 : 0,
    activeRuns: withCampaign && !campaignStopped ? 1 : 0,
  },
  pagination: {
    limit: 50,
    offset: 0,
    totalCampaigns: withCampaign ? 1 : 0,
    hasMore: false,
  },
});
const bodySchema = z.object({
  name: z.string(),
  targetId: z.uuid(),
  mode: z.literal("live"),
  scope: scopeSchema,
});

const web = express();
web.use(express.static(resolve("dist/web")));
web.get("/{*path}", (_req, res) =>
  res.sendFile(resolve("dist/web/index.html")),
);
const server = web.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1024 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.abort(),
);
await page.route("**/api/**", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.pathname === "/api/auth/session")
    return route.fulfill({ json: session });
  if (url.pathname === "/api/setup") {
    setupRequests++;
    return route.fulfill({ json: setup });
  }
  if (url.pathname === "/api/overview")
    return overviewFails
      ? route.fulfill({
          status: 503,
          json: {
            error: "Workspace summary temporarily unavailable in this test",
          },
        })
      : route.fulfill({ json: overview() });
  if (url.pathname === "/api/findings") {
    findingQueries.push(url.searchParams);
    return route.fulfill({
      json: {
        runs: [],
        pagination: {
          limit: 50,
          offset: Number(url.searchParams.get("offset") ?? 0),
          totalRuns: 0,
          hasMore: false,
        },
      },
    });
  }
  if (url.pathname === `/api/runs/${initialRun.id}`)
    return route.fulfill({ json: initialRun });
  if (url.pathname === "/api/campaigns" && request.method() === "POST") {
    campaignBodies.push(request.postDataJSON());
    campaignStarted();
    if (campaignMode === "fail")
      return route.fulfill({
        status: 409,
        json: { error: "Configuration changed while reviewing. Please retry." },
      });
    await new Promise<void>((resolve) => {
      releaseCampaign = resolve;
    });
    return route.fulfill({
      status: 201,
      json: {
        id: initialRun.campaign_id,
        initialRunId: initialRun.id,
        configHash: "browser-only-digest",
        configHashAlgorithm: "sha256-sorted-json-v1",
      },
    });
  }
  if (url.pathname === `/api/campaigns/${initialRun.campaign_id}/stop`) {
    stopRequests++;
    stopStarted();
    await new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    campaignStopped = true;
    initialRun.status = "cancelled";
    initialRun.campaign_status = "stopped";
    return route.fulfill({ json: { status: "stopped" } });
  }
  unexpected.push(`${request.method()} ${url.pathname}`);
  return route.fulfill({
    status: 500,
    json: { error: "Unexpected intercepted workflow request" },
  });
});

async function bounded(request: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      request,
      new Promise<void>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error("Expected browser-only request did not start")),
          8000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function checkAccessibility(screen: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  accessibilityChecks.push({
    screen,
    width: page.viewportSize()?.width ?? 0,
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
  });
}
async function captureModal(name: "review" | "stop") {
  await mkdir("artifacts/verification", { recursive: true });
  const dialog = page.getByRole("dialog");
  for (const size of [
    { width: 1440, height: 1024, label: "desktop" },
    { width: 390, height: 844, label: "mobile" },
  ]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
      true,
      `${name} modal must fit at ${size.width}px`,
    );
    await checkAccessibility(`${name} ${size.label}`);
    await page.screenshot({
      path: `artifacts/verification/workflow-${name}-${size.label}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1024 });
}
async function campaignWizard() {
  await page.goto(`${origin}/app`);
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Campaign name", { exact: true })
    .fill("Reviewed workflow campaign");
  await dialog.getByLabel("Maximum calls").fill("8");
  await dialog.getByLabel("Maximum duration per call in seconds").fill("90");
  await dialog.getByLabel("Authorized window in minutes").fill("30");
  await dialog.getByLabel("Budget limit in USD").fill("0.00000001");
  await dialog
    .getByLabel("Stop remaining calls after the first policy violation")
    .check();
  assert.equal(
    campaignBodies.length,
    0,
    "Editing scope must not create a campaign",
  );
  await dialog
    .getByRole("button", { name: "Review campaign", exact: true })
    .click();
  await dialog
    .getByText(
      "Enter a budget from 0 to 100 USD with no more than two decimal places.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await dialog
      .getByRole("heading", { name: "Set the scope", exact: true })
      .isVisible(),
    true,
    "Sub-cent precision must be corrected before entering review",
  );
  assert.equal(campaignBodies.length, 0);
  await dialog.getByLabel("Budget limit in USD").fill("12.34");
  await dialog
    .getByRole("button", { name: "Review campaign", exact: true })
    .click();
  await dialog
    .getByRole("heading", { name: "Review and launch", exact: true })
    .waitFor();
  assert.equal(
    campaignBodies.length,
    0,
    "Reviewing scope must not create a campaign",
  );
  const reviewedAuthorization = dialog.getByLabel(
    "I authorize this campaign within the reviewed scope.",
    { exact: true },
  );
  assert.equal(
    await reviewedAuthorization.isVisible(),
    true,
    "Final authorization must be visible outside the hidden scope fields",
  );
  assert.equal(
    await reviewedAuthorization.isEnabled(),
    true,
    "Final authorization must remain usable during review",
  );
  assert.equal(
    await dialog
      .getByRole("group", { name: "Campaign scope", includeHidden: true })
      .isVisible(),
    false,
  );
  await captureModal("review");
  const launch = dialog.getByRole("button", {
    name: "Authorize and launch campaign",
    exact: true,
  });
  assert.equal(
    await launch.isDisabled(),
    true,
    "Explicit reviewed authorization is required",
  );
  await dialog
    .locator("form")
    .evaluate((form) =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await page.waitForTimeout(100);
  assert.equal(
    campaignBodies.length,
    0,
    "Submitting the review without authorization must not create a campaign",
  );
  await dialog
    .getByRole("button", { name: "Back to scope", exact: true })
    .click();
  assert.equal(
    await dialog.getByLabel("Campaign name", { exact: true }).inputValue(),
    "Reviewed workflow campaign",
  );
  assert.equal(await dialog.getByLabel("Maximum calls").inputValue(), "8");
  assert.equal(
    await dialog.getByLabel("Budget limit in USD").inputValue(),
    "12.34",
  );
  await dialog.getByLabel("Maximum calls").fill("6");
  await dialog
    .getByRole("button", { name: "Review campaign", exact: true })
    .click();
  const authorization = dialog.getByLabel(
    "I authorize this campaign within the reviewed scope.",
    { exact: true },
  );
  assert.equal(
    await authorization.isChecked(),
    false,
    "Returning to review must require current authorization",
  );
  await authorization.check();
  await launch.click();
  await dialog
    .getByText("Configuration changed while reviewing. Please retry.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await reviewedAuthorization.isVisible(),
    true,
    "A submission error must not hide final authorization",
  );
  await checkAccessibility("review server error");
  assert.equal(campaignBodies.length, 1);
  assert.equal(
    await dialog
      .getByRole("heading", { name: "Review and launch", exact: true })
      .count(),
    1,
    "A server error must preserve the reviewed draft",
  );
  await dialog
    .getByRole("button", { name: "Back to scope", exact: true })
    .click();
  assert.equal(await dialog.getByLabel("Maximum calls").inputValue(), "6");
  assert.equal(
    await dialog.getByLabel("Campaign name", { exact: true }).inputValue(),
    "Reviewed workflow campaign",
  );
  await dialog
    .getByRole("button", { name: "Review campaign", exact: true })
    .click();
  await authorization.check();
  campaignMode = "hold";
  const started = new Promise<void>((resolve) => {
    campaignStarted = resolve;
  });
  await launch.click();
  await bounded(started);
  await dialog.locator("form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await page.waitForTimeout(100);
  assert.equal(
    campaignBodies.length,
    2,
    "Repeated submit events must not duplicate a pending launch",
  );
  assert.equal(
    await dialog
      .getByRole("button", { name: "Launching…", exact: true })
      .isDisabled(),
    true,
  );
  const payload = bodySchema.parse(campaignBodies[1]);
  assert.equal(payload.name, "Reviewed workflow campaign");
  assert.equal(payload.targetId, target.id);
  assert.equal(payload.scope.maxCalls, 6);
  assert.equal(payload.scope.maxDurationSeconds, 90);
  assert.equal(payload.scope.budgetCents, 1234);
  assert.equal(payload.scope.stopOnFinding, true);
  assert.equal(
    Date.parse(payload.scope.endsAt) - Date.parse(payload.scope.startsAt),
    30 * 60000,
  );
  releaseCampaign();
  await page.waitForURL((url) => url.pathname === `/app/runs/${initialRun.id}`);
  await dialog.waitFor({ state: "hidden" });
  await page.locator(".detail-heading").waitFor();
}

async function stopConfirmation() {
  withCampaign = true;
  await page.goto(`${origin}/app/campaigns`);
  const stop = page.getByRole("button", {
    name: `Stop ${initialRun.campaign_name}`,
    exact: true,
  });
  await stop.click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("heading", { name: "Stop this campaign?", exact: true })
    .waitFor();
  await captureModal("stop");
  assert.equal(stopRequests, 0, "Opening confirmation cannot stop a campaign");
  await dialog
    .getByRole("button", { name: "Keep campaign", exact: true })
    .click();
  assert.equal(
    stopRequests,
    0,
    "Cancelling confirmation cannot stop a campaign",
  );
  await stop.click();
  const started = new Promise<void>((resolve) => {
    stopStarted = resolve;
  });
  await dialog
    .getByRole("button", { name: "Stop campaign", exact: true })
    .evaluate((button) => {
      button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
  await bounded(started);
  await page.waitForTimeout(100);
  assert.equal(
    stopRequests,
    1,
    "Repeated confirmation cannot duplicate a pending stop request",
  );
  assert.equal(
    await dialog
      .getByRole("button", { name: "Requesting stop…", exact: true })
      .isDisabled(),
    true,
  );
  releaseStop();
  await dialog.waitFor({ state: "hidden" });
  await page
    .locator(".campaign-entry")
    .getByText("Stopped", { exact: true })
    .waitFor();
  withCampaign = false;
}

async function blockedEntryPoints() {
  prerequisitesBlocked = true;
  setup = { ...readySetup(), liveConfigurationReady: false };
  await page.goto(`${origin}/app`);
  await page
    .getByRole("heading", {
      name: "Start with an approved target",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Register your first target", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Target name", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Target name", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  prerequisitesBlocked = false;
  setup = readySetup();
  await page.goto(`${origin}/app`);
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Campaign name", { exact: true })
    .waitFor();
  prerequisitesBlocked = true;
  setup = { ...readySetup(), liveConfigurationReady: false };
  const refreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/overview",
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await refreshed;
  const dialog = page.getByRole("dialog");
  const register = dialog.getByRole("link", {
    name: "Register an approved target",
    exact: true,
  });
  const integrations = dialog.getByRole("link", {
    name: "Open integrations",
    exact: true,
  });
  assert.equal(await register.getAttribute("href"), "/app/targets");
  assert.equal(await integrations.getAttribute("href"), "/app/integrations");
  await integrations.click();
  await page.waitForURL(`${origin}/app/integrations`);
  await page
    .getByRole("heading", { name: "Workspace setup", exact: true })
    .waitFor();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    campaignBodies.length,
    2,
    "Blocked campaign guidance cannot dispatch a call",
  );
  prerequisitesBlocked = false;
}

async function independentEvidenceAndDiagnostics() {
  overviewFails = true;
  setup = readySetup();
  await page.goto(`${origin}/app/runs/${initialRun.id}`);
  await page.locator(".detail-heading").waitFor();
  await page
    .getByRole("heading", { name: "Contact verification control", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Back to workspace", exact: true })
      .isVisible(),
    true,
    "A summary request failure must not block the independent evidence route",
  );
  setup = {
    ...readySetup(),
    databaseReady: false,
    canRegisterTarget: false,
    liveConfigurationReady: false,
    checks: readySetup().checks.map((check) =>
      check.id === "worker"
        ? {
            ...check,
            state: "not_checked",
            detail: "Worker status requires a configured database.",
          }
        : check.id === "database"
          ? {
              ...check,
              state: "action_required",
              detail: "Database connection needs configuration",
              fields: ["DATABASE_URL"],
              command: "pnpm db:migrate",
            }
          : check,
    ),
  };
  await page.goto(`${origin}/app/integrations`);
  await page
    .getByRole("heading", { name: "Workspace setup", exact: true })
    .waitFor();
  await page
    .getByText("Database connection needs configuration", { exact: true })
    .waitFor();
  const before = setupRequests;
  setup = readySetup();
  const retry = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/setup",
  );
  await page.getByRole("button", { name: "Check setup", exact: true }).click();
  await retry;
  const database = page
    .locator(".setup-checks li")
    .filter({ hasText: "Database connection" });
  if (
    !(await database
      .locator("details")
      .evaluate(
        (element) => element instanceof HTMLDetailsElement && element.open,
      ))
  )
    await database.locator("summary").click();
  await page
    .getByText("Database verification now complete", { exact: true })
    .waitFor();
  assert.ok(
    setupRequests > before,
    "Setup retry must fetch and display fresh diagnostic state",
  );
  overviewFails = false;
}

async function clearEmptyFindings() {
  overviewFails = true;
  await page.goto(`${origin}/app/findings?q=absent&outcome=unknown&page=2`);
  const clear = page
    .getByRole("button", { name: "Clear filters", exact: true })
    .or(page.getByRole("link", { name: "Clear filters", exact: true }));
  const requested = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/findings" &&
      url.searchParams.get("search") === "" &&
      url.searchParams.get("outcome") === "all"
    );
  });
  await clear.click();
  await page.waitForURL(
    (url) => url.pathname === "/app/findings" && !url.search,
  );
  await requested;
  assert.ok(
    findingQueries.some(
      (query) =>
        query.get("search") === "" &&
        query.get("outcome") === "all" &&
        query.get("offset") === "0",
    ),
    "Clearing filters must request the unfiltered global first page",
  );
}

try {
  await campaignWizard();
  await stopConfirmation();
  await blockedEntryPoints();
  await independentEvidenceAndDiagnostics();
  await clearEmptyFindings();
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/verification/workflow-accessibility.json",
    JSON.stringify(accessibilityChecks, null, 2),
  );
  assert.deepEqual(
    accessibilityChecks.filter((check) => check.violations.length),
    [],
    "New workflow dialogs must pass automated WCAG checks",
  );
  console.log(
    "Browser workflow passed with intercepted test-only requests. Scope review, explicit authorization, preserved drafts, duplicate protection, initial-run navigation, confirmed stop, actionable setup, independent evidence, diagnostic retry and empty-filter recovery verified. No database writes or external calls.",
  );
} finally {
  releaseCampaign();
  releaseStop();
  await context.close();
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
