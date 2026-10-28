import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
await mkdir("artifacts/redesign", { recursive: true });
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
const collectCoverage = process.env.VOUCH_COVERAGE === "1";
if (collectCoverage)
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
const coverageSnapshots: Awaited<
  ReturnType<typeof page.coverage.stopJSCoverage>
>[] = [];
async function checkpoint(restart = true) {
  if (!collectCoverage) return;
  coverageSnapshots.push(await page.coverage.stopJSCoverage());
  if (restart)
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
}
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const origin = "http://127.0.0.1:4000";
const name = `Browser verification · ${Date.now()}`;
async function noOverflow(context: string) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    `${context} must not overflow`,
  );
}
async function accessibility(context: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
    `${context} accessibility checks`,
  );
}
try {
  await page.goto(origin);
  await page
    .getByRole("heading", { name: "Confidence. On the line." })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await accessibility("Landing");
  await page.screenshot({
    path: "artifacts/redesign/landing-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Are live Bolna calls available?" })
    .click();
  await page
    .getByText("Not yet. The connector includes", { exact: false })
    .waitFor();
  await page
    .getByRole("link", { name: "Enter the workspace", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Your testing, in focus." })
    .waitFor();
  const gliderBefore = await page.locator(".nav-glider").getAttribute("style");
  await page.getByRole("link", { name: /^Findings/ }).hover();
  await page.waitForFunction(
    (before) =>
      document.querySelector(".nav-glider")?.getAttribute("style") !== before,
    gliderBefore,
  );
  assert.ok(page.url().endsWith("/app"), "Hover must not switch routes");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page.getByLabel("Campaign name").fill(name);
  await page.getByLabel("Maximum calls").fill("3");
  await page
    .getByLabel("I authorize this campaign within the scope above.")
    .check();
  await page.getByRole("button", { name: "Launch fixture campaign" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(
    async (campaignName) => {
      const d = await (await fetch("/api/overview")).json();
      return (
        d.campaigns.find((x: { name: string }) => x.name === campaignName)
          ?.status === "completed"
      );
    },
    name,
    { timeout: 20000 },
  );
  await page.getByText(name, { exact: true }).waitFor();
  await page
    .getByRole("status")
    .getByRole("button", { name: "Dismiss notification" })
    .click();
  await accessibility("Dashboard");
  await page.screenshot({
    path: "artifacts/redesign/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: /^Findings/ }).click();
  await page.getByLabel("Search findings").fill(name);
  await page
    .getByRole("button")
    .filter({ hasText: "Identity verification bypass" })
    .click();
  await page
    .getByRole("heading", { name: "Identity verification bypass", exact: true })
    .waitFor();
  await checkpoint();
  const runUrl = page.url();
  await page.reload();
  await page
    .getByRole("heading", { name: "Identity verification bypass", exact: true })
    .waitFor();
  assert.equal(page.url(), runUrl, "Evidence is bookmarkable");
  await page.getByRole("tab", { name: "Timeline", exact: true }).click();
  await page.getByText("Tool Executed", { exact: true }).waitFor();
  await page
    .getByRole("tab", { name: "Timeline", exact: true })
    .press("ArrowRight");
  await page.locator(".raw-events").waitFor();
  assert.ok(
    (await page.locator(".raw-events").innerText()).includes("backend.state"),
  );
  await page
    .getByRole("tab", { name: "Raw Events", exact: false })
    .press("Home");
  assert.equal(
    await page
      .getByRole("tab", { name: "Conversation", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page
    .getByLabel("Review rationale")
    .fill("Verified the backend mutation and missing identity event.");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByText("Confirmed", { exact: true }).first().waitFor();
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export regression" }).click();
  const download = await downloading;
  assert.ok(download.suggestedFilename().endsWith("regression.v1.json"));
  await page
    .getByRole("status")
    .getByRole("button", { name: "Dismiss notification" })
    .click();
  await accessibility("Evidence");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/redesign/evidence-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Rerun case" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Same configuration queued" })
    .waitFor();
  await page.getByRole("button", { name: "Rerun case" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Maximum call count reached" })
    .waitFor();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page
    .getByRole("status")
    .getByRole("button", { name: "Dismiss notification" })
    .click();
  // UI-only records exercise conservative rendering; no fabricated results are persisted.
  const runId = new URL(runUrl).pathname.split("/").at(-1)!;
  const recorded = await (
    await page.request.get(`${origin}/api/runs/${runId}`)
  ).json();
  async function showRecord(record: Record<string, unknown>) {
    await checkpoint();
    await page.route(`**/api/runs/${runId}`, (route) =>
      route.fulfill({ json: record }),
    );
    await page.goto(runUrl);
    await page
      .getByRole("heading", {
        name: "Identity verification bypass",
        exact: true,
      })
      .or(
        page.getByRole("heading", {
          name: "False-authority verification test",
          exact: true,
        }),
      )
      .waitFor();
  }
  await showRecord({
    ...recorded,
    status: "queued",
    verdict: null,
    config: {},
    config_hash: null,
    events: [],
    reviews: [],
  });
  await page.getByText("Hash unavailable", { exact: true }).waitFor();
  await page.getByText("Not captured", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Replay transcript with synthetic speech" })
      .isDisabled(),
    true,
  );
  await page.unroute(`**/api/runs/${runId}`);
  await showRecord({
    ...recorded,
    verdict: {
      ...recorded.verdict,
      outcome: "unknown",
      reason: "No complete backend telemetry; the outcome is unknown.",
      stateChanged: null,
    },
    events: recorded.events.filter(
      (e: { kind: string }) => e.kind === "transcript",
    ),
  });
  await page.getByText("Evidence is incomplete", { exact: true }).waitFor();
  await page
    .getByText("Backend state evidence is unknown.", { exact: false })
    .waitFor();
  await page.unroute(`**/api/runs/${runId}`);
  await showRecord({
    ...recorded,
    verdict: {
      ...recorded.verdict,
      outcome: "pass",
      reason: "Verification preceded the tool; no durable change was observed.",
      stateChanged: false,
      verificationObserved: true,
    },
    events: [
      {
        id: "browser-verification",
        kind: "identity.verified",
        source: "backend",
        at: 0,
        seq: 0,
        data: { accountId: "SYN-1042", method: "synthetic_challenge" },
      },
      ...recorded.events.map(
        (e: { kind: string; data: Record<string, unknown> }) =>
          e.kind === "backend.state"
            ? { ...e, data: { ...e.data, after: e.data.before } }
            : e,
      ),
    ],
  });
  await page.getByText("No change observed", { exact: true }).waitFor();
  await page
    .getByText("Policy precondition satisfied", { exact: true })
    .waitFor();
  await page.evaluate(
    "Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices(){return []},speak(){},cancel(){}}})",
  );
  await page
    .getByRole("button", { name: "Replay transcript with synthetic speech" })
    .click();
  await page
    .getByText("No local speech voices are installed.", { exact: false })
    .waitFor();
  await page.evaluate(
    "Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices(){return [{name:'Synthetic test voice'}]},speak(){},cancel(){}}})",
  );
  await page
    .getByRole("button", { name: "Replay transcript with synthetic speech" })
    .click();
  await page
    .getByRole("button", { name: "Stop synthetic speech replay" })
    .click();
  await page.unroute(`**/api/runs/${runId}`);
  await showRecord({
    ...recorded,
    synthetic: false,
    config_integrity: "mismatch",
  });
  await page
    .getByText("Reported by the target's backend evidence connector", {
      exact: true,
    })
    .waitFor();
  await page
    .getByText(
      "Configuration mismatch. This record differs from its captured digest",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page
      .getByText("Independently read from PostgreSQL · fictional account", {
        exact: true,
      })
      .count(),
    0,
  );
  await page.unroute(`**/api/runs/${runId}`);
  await checkpoint();
  await page.goto(runUrl);
  await page
    .getByRole("heading", { name: "Identity verification bypass", exact: true })
    .waitFor();
  for (const width of [320, 360, 390, 768, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(`Evidence at ${width}px`);
    if (width === 390)
      await page.screenshot({
        path: "artifacts/redesign/evidence-mobile.png",
        fullPage: true,
      });
  }
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.getByRole("link", { name: "Targets", exact: true }).click();
  await page
    .getByRole("button", { name: "Register target", exact: true })
    .click();
  const targetName = `Browser target ${Date.now()}`;
  await page.getByLabel("Target name").fill(targetName);
  await page
    .getByLabel("Authorization reference")
    .fill("Synthetic browser test target owned by the local workspace.");
  await page
    .getByLabel("I own this target or have explicit authorization to test it.")
    .check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Register target", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .locator(".target-row")
    .filter({ hasText: targetName })
    .getByRole("button", { name: "Create campaign" })
    .click();
  const selected = page.getByLabel("Approved target");
  assert.ok(
    (await selected.locator("option:checked").innerText()).includes(targetName),
    "Target-specific launch must preselect that target",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  const overviewRecord = await (
    await page.request.get(`${origin}/api/overview`)
  ).json();
  await page.route("**/api/overview", (route) =>
    route.fulfill({
      json: {
        ...overviewRecord,
        targets: [
          ...overviewRecord.targets,
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "Synthetic PSTN availability check",
            transport: "pstn",
            phone: "+12025550199",
            authorization_reference:
              "Browser-only synthetic unavailable-state fixture",
          },
        ],
      },
    }),
  );
  await checkpoint();
  await page.goto(`${origin}/app/targets`);
  const pstn = page
    .locator(".target-row")
    .filter({ hasText: "Synthetic PSTN availability check" });
  await pstn.getByText("PSTN · live unverified").waitFor();
  assert.equal(
    await pstn.getByRole("button", { name: "Create campaign" }).isDisabled(),
    true,
  );
  await page.unroute("**/api/overview");
  await page.getByRole("link", { name: "Integrations", exact: true }).click();
  await page.getByRole("heading", { name: "Bolna", exact: true }).waitFor();
  await page.getByText("Live unverified", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow("Integrations mobile");
  await accessibility("Integrations mobile");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "artifacts/redesign/dashboard-mobile.png",
    fullPage: true,
  });
  await checkpoint();
  await page.goto(origin);
  await noOverflow("Landing mobile");
  await accessibility("Landing mobile");
  await page.screenshot({
    path: "artifacts/redesign/landing-mobile.png",
    fullPage: true,
  });
  for (const width of [320, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 1024 });
    await noOverflow(`Landing ${width}px`);
    assert.equal(
      await page
        .locator(".hero-inner h1")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
      "Hero text must remain visible at every tested width",
    );
  }
  await checkpoint();
  await page.goto(`${origin}/credits`);
  await page.getByRole("heading", { name: "Credits & assets." }).waitFor();
  assert.equal(
    await page.getByText("Tessory reference", { exact: true }).count(),
    0,
  );
  for (const path of [
    "/licenses/phosphor-MIT.txt",
    "/licenses/geist-OFL.txt",
    "/licenses/geist-mono-OFL.txt",
    "/brand/vouch-mark.webp",
    "/brand/icon-192.png",
    "/favicon.ico",
  ])
    assert.equal(
      (await page.request.get(`${origin}${path}`)).status(),
      200,
      `${path} remains public`,
    );
  for (const path of [
    "/docs/reports/repository-audit.md",
    "/docs/history/action-log.md",
    "/artifacts/redesign/landing-desktop.png",
    "/package.json",
    "/apps/api/src/server.ts",
    "/brand/vouch-mark.png",
    "/assets/internal-source.js.map",
  ])
    assert.equal(
      (await page.request.get(`${origin}${path}`)).status(),
      404,
      `${path} is private`,
    );
  if (!collectCoverage)
    assert.equal(
      (await readdir("dist/web", { recursive: true })).some((file) =>
        file.endsWith(".map"),
      ),
      false,
      "Production must not package source maps",
    );
  const overviewResponse = await page.request.get(`${origin}/api/overview`);
  assert.equal(overviewResponse.headers()["cache-control"], "no-store");
  // Exercise every workspace view at phone, tablet, desktop and wide widths.
  for (const route of [
    "/app",
    "/app/campaigns",
    "/app/findings",
    "/app/targets",
    "/app/integrations",
  ]) {
    await checkpoint();
    await page.goto(`${origin}${route}`);
    await page.locator(".page-heading h1").waitFor();
    for (const width of [320, 390, 768, 1440, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(`${route} at ${width}px`);
    }
  }
  assert.equal(
    (await page.request.get(`${origin}/.env`)).status(),
    404,
    "Dotfiles must not be served",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser passed: landing, hover navigation, campaign → worker → evidence → review → export → bounded rerun, target selection, bookmarkable routes, all workspace views responsive 320–2560px, axe WCAG checks, public/private assets and no production source maps.",
  );
} finally {
  if (collectCoverage) {
    await checkpoint(false);
    await mkdir(".data/browser-v8", { recursive: true });
    await writeFile(
      ".data/browser-v8/coverage-browser.json",
      JSON.stringify({ snapshots: coverageSnapshots }),
    );
  }
  await browser.close();
}
