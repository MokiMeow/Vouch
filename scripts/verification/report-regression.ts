// Test-only intercepted records. Nothing is inserted into an application database.
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { chromium, type Page } from "playwright";
import type {
  AuthSession,
  Campaign,
  FindingsPage,
  Overview,
  Run,
  RunSummary,
  Scope,
} from "../../apps/web/src/shared/types";
import type { SetupStatus } from "../../packages/core/src/setup";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const createdAt = "2026-10-29T10:00:00.000Z";
const scope: Scope = {
  startsAt: new Date(Date.now() - 60000).toISOString(),
  endsAt: new Date(Date.now() + 3600000).toISOString(),
  concurrency: 1,
  maxCalls: 4,
  maxDurationSeconds: 60,
  budgetCents: 100,
  syntheticIdentity: "Browser verification identity",
  stopOnFinding: false,
};
const runs: RunSummary[] = Array.from({ length: 71 }, (_, index) => ({
  id: uuid(index + 1),
  campaign_id: uuid(index + 1001),
  campaign_name:
    index === 64
      ? "Report needle outside loaded history"
      : `Report campaign ${String(index + 1).padStart(3, "0")}`,
  target_name: "Browser-only authorized target",
  scenario: index === 70 ? "false_authority" : "benign_control",
  status: "completed",
  synthetic: false,
  review: "pending",
  created_at: createdAt,
  verdict: {
    outcome: index === 70 ? "violation" : "pass",
    tier: "tool_executed",
    reason: "Browser-only request regression observation",
    requested: true,
    executed: true,
    stateChanged: null,
    verificationObserved: index !== 70,
  },
}));
const campaigns: Campaign[] = runs.map((run, index) => ({
  id: run.campaign_id,
  name: run.campaign_name,
  target_id: uuid(2001),
  mode: "live",
  target_name: run.target_name,
  status: index === 0 ? "running" : "completed",
  calls_used: 2,
  scope,
  created_at: createdAt,
}));
const session: AuthSession = {
  mode: "local",
  authenticated: true,
  user: null,
  workspace: {
    id: uuid(3001),
    name: "Browser verification only",
    role: "owner",
  },
  workspaces: [],
  csrfToken: null,
};
const details = new Map<string, Run>(
  runs.map((run) => [
    run.id,
    {
      ...run,
      config: { scope },
      scope,
      campaign_status: "completed",
      calls_used: 4,
      remainingSlots: 0,
      exportReady: false,
      events: [],
      reviews: [],
      artifacts: [],
      liveExecution: null,
      recording: {
        available: false,
        reason: "No recording in browser-only test",
      },
    },
  ]),
);
const base: Overview = {
  targets: [
    {
      id: uuid(2001),
      name: "Browser-only authorized target",
      transport: "pstn",
      phone: "+12025550199",
      authorization_reference: "Test-only interception, no phone calls",
      created_at: createdAt,
    },
  ],
  campaigns: [],
  runs: [],
  policy: { id: "contact-verification", version: 1 },
  live: {
    configured: true,
    agentConfigured: true,
    verified: false,
    enabled: true,
    reason: "No provider calls from browser regression",
  },
  summary: {
    campaigns: campaigns.length,
    runs: runs.length,
    candidates: 1,
    backendVerified: 0,
    pendingFindings: 1,
    totalRuns: runs.length,
    activeRuns: 0,
  },
};
const setup: SetupStatus = {
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
    title: `${key} configuration`,
    state: "ready",
    detail: "Test-only configuration present. No real provider call verified.",
    fields: [],
    docsPath: "/docs/quickstart",
  })),
};
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
const pageErrors: string[] = [];
const unexpectedApi: string[] = [];
const findingQueries: URLSearchParams[] = [];
const accessibilityFindings: { screen: string; violations: unknown[] }[] = [];
let detailWrites = 0;
let stopRequests = 0;
let providerMode: "fail" | "hold" = "fail";
let releaseProvider: () => void = () => {};
let providerStarted: () => void = () => {};
page.on("pageerror", (error) => pageErrors.push(error.message));
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.abort(),
);
await page.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === "/api/auth/session")
    return route.fulfill({ json: session });
  if (url.pathname === "/api/setup") return route.fulfill({ json: setup });
  if (url.pathname === "/api/overview") {
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const visible = campaigns.slice(offset, offset + 50);
    return route.fulfill({
      json: {
        ...base,
        campaigns: visible,
        runs: runs.filter((run) =>
          visible.some((campaign) => campaign.id === run.campaign_id),
        ),
        pagination: {
          limit: 50,
          offset,
          totalCampaigns: campaigns.length,
          hasMore: offset + 50 < campaigns.length,
        },
      } satisfies Overview,
    });
  }
  if (url.pathname === "/api/findings") {
    findingQueries.push(url.searchParams);
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    const outcome = url.searchParams.get("outcome") ?? "all";
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const matching = runs.filter(
      (run) =>
        run.campaign_name.toLowerCase().includes(search) &&
        (outcome === "all" || run.verdict?.outcome === outcome),
    );
    return route.fulfill({
      json: {
        runs: matching.slice(offset, offset + 50),
        pagination: {
          limit: 50,
          offset,
          totalRuns: matching.length,
          hasMore: offset + 50 < matching.length,
        },
      } satisfies FindingsPage,
    });
  }
  const runId = url.pathname.match(/^\/api\/runs\/([a-f0-9-]+)$/)?.[1];
  if (runId && request.method() === "GET") {
    const detail = details.get(runId);
    return detail
      ? route.fulfill({ json: detail })
      : route.fulfill({ status: 404, json: { error: "Run not found" } });
  }
  if (/^\/api\/runs\//.test(url.pathname) && request.method() !== "GET")
    detailWrites++;
  if (/^\/api\/campaigns\/[a-f0-9-]+\/stop$/.test(url.pathname)) {
    stopRequests++;
    return route.fulfill({
      status: 409,
      json: { error: "Stop request could not be accepted" },
    });
  }
  if (url.pathname === "/api/integrations/bolna/check") {
    providerStarted();
    if (providerMode === "hold")
      await new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
    return route.fulfill({
      status: 409,
      json: { error: "Old provider check failed" },
    });
  }
  unexpectedApi.push(`${request.method()} ${url.pathname}`);
  return route.fulfill({
    status: 500,
    json: { error: "Unexpected request in isolated browser regression" },
  });
});

async function noOverflow(target: Page, label: string) {
  assert.equal(
    await target.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    `${label} must fit the viewport`,
  );
}
async function visit(path: string) {
  await page.goto(`${origin}${path}`);
  await page.locator(".page-heading h1").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function accessibility(screen: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  if (result.violations.length)
    accessibilityFindings.push({
      screen,
      violations: result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
          html: node.html,
        })),
      })),
    });
}
async function publicVisit(path: string, title: string) {
  await page.goto(`${origin}${path}`);
  await page
    .getByRole("heading", { level: 1, name: title, exact: true })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function docsChecks() {
  const guides = [
    ["/docs", "Introduction"],
    ["/docs/quickstart", "Quickstart"],
    ["/docs/first-campaign", "First campaign"],
    ["/docs/evidence", "Evidence and policies"],
    ["/docs/integrations", "Integrations"],
    ["/docs/api", "API reference"],
    ["/docs/troubleshooting", "Troubleshooting"],
  ];
  for (const [path, title] of guides) {
    await publicVisit(path, title);
    assert.equal(
      await page
        .locator(
          'img[src*="vouch-scout"], img[src*="vouch-builder"], img[class*="mascot"]',
        )
        .count(),
      0,
      `${path} must not render retired mascot images`,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page, `${path} mobile`);
    await page.setViewportSize({ width: 1440, height: 1024 });
  }
  await publicVisit("/docs/quickstart", "Quickstart");
  const search = page.getByRole("searchbox", { name: "Search documentation" });
  await search.fill("   ");
  assert.equal(
    await page
      .getByRole("navigation", { name: "Documentation chapters", exact: true })
      .getByRole("link")
      .count(),
    7,
    "Whitespace docs searches keep all guides available",
  );
  assert.equal(
    await page.getByText("No matching guides", { exact: true }).count(),
    0,
  );
  await search.fill("supabase postgres");
  assert.equal(
    await page
      .getByRole("navigation", { name: "Documentation chapters", exact: true })
      .getByRole("link", { name: "Quickstart", exact: true })
      .count(),
    1,
    "Docs search matches words from guide contents",
  );
  await search.fill("zzzz-no-such-guide-4581");
  await page.getByText("No matching guides", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  assert.equal(await search.inputValue(), "");
  assert.equal(
    await page
      .getByRole("navigation", { name: "Documentation chapters", exact: true })
      .getByRole("link")
      .count(),
    7,
  );
  await search.focus();
  const focus = await search.evaluate((input) => ({
    inputOutline: getComputedStyle(input).outlineStyle,
    inputShadow: getComputedStyle(input).boxShadow,
    wrapperShadow: input.parentElement
      ? getComputedStyle(input.parentElement).boxShadow
      : "none",
  }));
  assert.equal(
    focus.inputOutline,
    "none",
    "Docs search must not have a second input outline",
  );
  assert.equal(
    focus.inputShadow,
    "none",
    "Docs search must not duplicate its wrapper focus ring",
  );
  assert.notEqual(
    focus.wrapperShadow,
    "none",
    "The docs search wrapper must retain a visible focus ring",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  });
  const command =
    "git clone https://github.com/MokiMeow/Vouch.git\ncd Vouch\npnpm install --frozen-lockfile";
  assert.equal(
    await page.locator('pre[aria-label="Clone and install"] code').innerText(),
    command,
  );
  await page
    .getByRole("button", { name: "Copy Clone and install", exact: true })
    .click();
  await page.getByText("Copied to clipboard", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    command,
    "Clipboard contents must preserve the exact documented command and newlines",
  );
  await publicVisit("/", "Confidence. On the line.");
  const links = page.locator('a[href^="/docs"]');
  assert.ok(
    (await links.count()) >= 3,
    "Landing must expose its docs entry points",
  );
  for (const link of await links.all()) {
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.ok(((await link.getAttribute("rel")) ?? "").includes("noopener"));
  }
  const popupOpened = context.waitForEvent("page");
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  const popup = await popupOpened;
  popup.on("pageerror", (error) => pageErrors.push(error.message));
  await popup
    .getByRole("heading", { name: "Introduction", exact: true })
    .waitFor();
  assert.equal(new URL(popup.url()).pathname, "/docs");
  assert.equal(
    await popup.evaluate(() => window.opener === null),
    true,
    "Documentation tabs must not retain an opener",
  );
  assert.equal(
    page.url(),
    `${origin}/`,
    "Opening documentation must preserve the landing tab",
  );
  await popup.close();
  assert.equal(
    await page
      .locator(
        'img[src*="vouch-scout"], img[src*="vouch-builder"], img[class*="mascot"]',
      )
      .count(),
    0,
    "Landing must not reference retired mascot images",
  );
}
async function boundedRequest(request: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      request,
      new Promise<void>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Expected intercepted action did not start")),
          8000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function verifyFindingsLocation(path: string) {
  await page.waitForURL(`${origin}${path}`);
  assert.equal(
    await page
      .getByRole("textbox", { name: "Search all findings" })
      .inputValue(),
    "report",
  );
  assert.equal(await page.getByLabel("Filter outcomes").inputValue(), "pass");
  await page.locator(".finding-row").first().waitFor();
  assert.equal(await page.locator(".finding-row").count(), 20);
}
const initial = "/app/findings?q=report&outcome=pass&page=2";
try {
  await docsChecks();
  await visit(initial);
  await verifyFindingsLocation(initial);
  assert.ok(
    findingQueries.some(
      (query) =>
        query.get("search") === "report" &&
        query.get("outcome") === "pass" &&
        query.get("offset") === "50",
    ),
    "URL state must drive the global findings endpoint",
  );
  await page.reload();
  await verifyFindingsLocation(initial);
  const first = page.locator(".finding-row").first();
  const href = await first.getAttribute("href");
  assert.ok(href);
  assert.equal(new URL(href, origin).searchParams.get("from"), initial);
  await first.click();
  await page.locator(".detail-heading").waitFor();
  await page.reload();
  await page.locator(".detail-heading").waitFor();
  assert.equal(new URL(page.url()).searchParams.get("from"), initial);
  await page
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  await verifyFindingsLocation(initial);
  await page.locator(".finding-row").first().click();
  await page.locator(".detail-heading").waitFor();
  await page.goBack();
  await verifyFindingsLocation(initial);

  await page.getByLabel("Filter outcomes").selectOption("all");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.goBack();
  await verifyFindingsLocation(initial);
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.notEqual(
    await page.evaluate(() => document.body.style.overflow),
    "hidden",
    "History navigation must restore body scrolling",
  );

  const globalSearch = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/findings" &&
      url.searchParams.get("search") === "needle"
    );
  });
  await page
    .getByRole("textbox", { name: "Search all findings" })
    .fill("needle");
  await globalSearch;
  const needle = page
    .locator(".finding-row")
    .filter({ hasText: "Report needle outside loaded history" });
  await needle.waitFor();
  assert.equal(
    await page.locator(".finding-row").count(),
    1,
    "Search must find a record outside the overview's loaded first 50 campaigns",
  );
  assert.equal(
    await needle.getByText("Pending", { exact: true }).count(),
    0,
    "A passed control must not carry a pending review chip",
  );
  assert.equal(
    new URL(page.url()).searchParams.get("page"),
    null,
    "Search starts on page one",
  );
  await needle.click();
  await page.locator(".detail-heading").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Rerun case", exact: true })
      .isDisabled(),
    true,
    "Zero remaining slots disable reruns",
  );
  const exportControl = page
    .getByRole("button", { name: /^Export (regression|not ready)$/ })
    .or(page.getByRole("link", { name: "Export regression", exact: true }));
  assert.equal(
    await exportControl.isDisabled(),
    true,
    "No recorded evidence must disable export",
  );
  assert.equal(
    await page.locator('a[href$="/export"]').count(),
    0,
    "Disabled exports must not remain downloadable links",
  );
  const needleDetail = details.get(uuid(65));
  assert.ok(needleDetail);
  needleDetail.remainingSlots = 2;
  needleDetail.calls_used = 2;
  needleDetail.campaign_status = "stopped";
  await page.reload();
  await page.locator(".detail-heading").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Rerun case", exact: true })
      .isDisabled(),
    true,
    "Stopped campaign metadata disables reruns even with unused slots",
  );

  await visit("/app/campaigns");
  const active = page
    .locator(".campaign-entry")
    .filter({ hasText: "Report campaign 001" });
  assert.equal(
    await active.getByRole("link").count(),
    1,
    "A campaign row must expose one primary accessible link",
  );
  assert.equal(
    await active
      .getByRole("button", { name: "Stop Report campaign 001", exact: true })
      .count(),
    1,
    "Active campaign stop is a separate explicit accessible action",
  );
  await active
    .getByRole("button", { name: "Stop Report campaign 001", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Stop this campaign?", exact: true })
    .waitFor();
  assert.equal(
    stopRequests,
    0,
    "Opening confirmation must not stop the campaign",
  );
  await page
    .getByRole("button", { name: "Keep campaign", exact: true })
    .click();
  assert.equal(
    stopRequests,
    0,
    "Cancelling confirmation must not stop the campaign",
  );
  await active
    .getByRole("button", { name: "Stop Report campaign 001", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Stop campaign", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText("Stop request could not be accepted", { exact: true })
    .waitFor();
  assert.equal(stopRequests, 1);
  await page
    .getByRole("button", { name: "Keep campaign", exact: true })
    .click();
  await page.goto(`${origin}/app/integrations`);
  await page
    .getByRole("heading", { name: "Workspace setup", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await page.getByText("Old provider check failed", { exact: true }).waitFor();
  await page.getByRole("link", { name: /^Findings/ }).click();
  assert.equal(
    await page.getByText("Old provider check failed", { exact: true }).count(),
    0,
    "Action errors clear when navigating",
  );

  await page.goto(`${origin}/app/integrations`);
  await page
    .getByRole("heading", { name: "Workspace setup", exact: true })
    .waitFor();
  providerMode = "hold";
  const started = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await boundedRequest(started);
  await page.getByRole("link", { name: /^Findings/ }).click();
  releaseProvider();
  await page.waitForTimeout(100);
  assert.equal(
    await page.getByText("Old provider check failed", { exact: true }).count(),
    0,
    "A late action error from the previous route must not surface on the new route",
  );

  for (const path of ["/app/campaigns", initial, `/app/runs/${uuid(65)}`]) {
    await visit(path);
    for (const width of [320, 390, 768, 1440, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      await noOverflow(page, `${path} at ${width}px`);
    }
  }
  assert.equal(
    detailWrites,
    0,
    "Disabled controls must never dispatch rerun or evidence writes",
  );
  assert.deepEqual(unexpectedApi, []);
  assert.deepEqual(pageErrors, []);
  await mkdir("artifacts/verification", { recursive: true });
  await page.screenshot({
    path: "artifacts/verification/report-regression.png",
    fullPage: true,
  });
  const captureScreens = [
    { name: "landing", path: "/", heading: "Confidence. On the line." },
    { name: "docs", path: "/docs/quickstart", heading: "Quickstart" },
    { name: "dashboard", path: "/app" },
    { name: "findings", path: initial },
    { name: "detail", path: `/app/runs/${uuid(65)}` },
  ];
  for (const screen of captureScreens) {
    await page.setViewportSize({ width: 1440, height: 1024 });
    if (screen.heading) await publicVisit(screen.path, screen.heading);
    else await visit(screen.path);
    if (screen.name === "findings") await verifyFindingsLocation(initial);
    await noOverflow(page, `${screen.name} desktop`);
    await accessibility(`${screen.name} desktop`);
    await page.screenshot({
      path: `artifacts/verification/report-${screen.name}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page, `${screen.name} mobile`);
    await accessibility(`${screen.name} mobile`);
    await page.screenshot({
      path: `artifacts/verification/report-${screen.name}-mobile.png`,
      fullPage: true,
    });
  }
  await writeFile(
    "artifacts/verification/report-accessibility.json",
    JSON.stringify(accessibilityFindings, null, 2),
  );
  assert.deepEqual(
    accessibilityFindings,
    [],
    "Rendered screens must pass automated WCAG A/AA checks",
  );
  assert.deepEqual(pageErrors, []);
  console.log(
    "Report browser regression passed with 71 intercepted test-only records. URL/history, modal cleanup, global search, review labels, action guards, stale errors, all Docs routes/search/copy/focus, landing links, 320–2560px layouts and automated WCAG checks verified. No database writes or external requests.",
  );
} finally {
  releaseProvider();
  await context.close();
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
