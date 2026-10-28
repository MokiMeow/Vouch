import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = "http://127.0.0.1:4000";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1024 },
  reducedMotion: "reduce",
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const collectCoverage = process.env.VOUCH_COVERAGE === "1";
const snapshots: Awaited<ReturnType<typeof page.coverage.stopJSCoverage>>[] =
  [];
if (collectCoverage)
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
async function checkpoint(restart = true) {
  if (!collectCoverage) return;
  snapshots.push(await page.coverage.stopJSCoverage());
  if (restart)
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
}
async function accessible(name: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
    `${name} accessibility`,
  );
}
async function responsive(name: string) {
  for (const width of [320, 390, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 1024 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${name} ${width}px must not overflow`,
    );
    if (width === 390)
      await page.screenshot({
        path: `artifacts/mission-control/${name}-mobile.png`,
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.screenshot({
    path: `artifacts/mission-control/${name}-desktop.png`,
    fullPage: true,
  });
}
async function readableProse() {
  const forbidden = await page.locator("main").evaluateAll((roots) => {
    const output: string[] = [];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest("pre,code,kbd,time,input,textarea"))
          continue;
        const text = node.textContent?.trim() ?? "";
        if (/[—:]/.test(text)) output.push(text);
      }
    }
    return output;
  });
  assert.deepEqual(
    forbidden,
    [],
    "User-facing prose must avoid em dashes and colons",
  );
}
const guides = [
  ["/docs", "Introduction", "docs"],
  ["/docs/quickstart", "Quickstart", "docs-quickstart"],
  ["/docs/first-campaign", "First campaign", "docs-first-campaign"],
  ["/docs/evidence", "Evidence and policies", "docs-evidence"],
  ["/docs/integrations", "Integrations", "docs-integrations"],
  ["/docs/api", "API reference", "docs-api"],
  ["/docs/troubleshooting", "Troubleshooting", "docs-troubleshooting"],
];
try {
  await mkdir("artifacts/mission-control", { recursive: true });
  for (const [path, heading, name] of guides) {
    await checkpoint();
    await page.goto(origin + path);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    assert.equal(await page.getByRole("main").count(), 1);
    await accessible(name);
    await readableProse();
    await responsive(name);
  }
  await checkpoint();
  await page.goto(origin + "/docs");
  const search = page.getByRole("searchbox", { name: "Search documentation" });
  await search.fill("zzzx-no-guide");
  await page.getByText("No matching guides", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await search.fill("verification");
  assert.ok(
    (await page
      .getByRole("navigation", { name: "Documentation chapters" })
      .getByRole("link")
      .count()) > 0,
  );
  await page
    .getByRole("button", { name: "Clear documentation search" })
    .click();
  await page
    .getByRole("navigation", { name: "Documentation chapters" })
    .getByRole("link", { name: "Quickstart", exact: true })
    .click();
  const copyName = "Copy Create local configuration safely";
  const snippet = page
    .locator("figure.docs-code")
    .filter({ has: page.getByRole("button", { name: copyName, exact: true }) });
  const command = await snippet.locator("pre code").innerText();
  await snippet.getByRole("button", { name: copyName, exact: true }).click();
  await snippet.getByText("Copied to clipboard", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    command,
    "Copy must contain the actual executable commands",
  );
  assert.ok(
    command.includes("test -e .env ||"),
    "Setup commands must preserve an existing environment file",
  );
  await page.evaluate(
    "Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}); document.execCommand=()=>false;",
  );
  await snippet.getByRole("button", { name: copyName, exact: true }).click();
  await snippet
    .getByText("Copy was blocked. Select the command and copy it manually.", {
      exact: true,
    })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.locator(".docs-mobile-bar button");
  await menu.click();
  assert.equal(await menu.getAttribute("aria-expanded"), "true");
  await page
    .getByRole("navigation", { name: "Documentation chapters" })
    .getByRole("link", { name: "First campaign", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "First campaign", exact: true })
    .waitFor();
  assert.equal(await menu.getAttribute("aria-expanded"), "false");
  await page.reload();
  await page
    .getByRole("heading", { name: "First campaign", exact: true })
    .waitFor();
  await checkpoint();
  await page.goto(origin + "/app");
  await page
    .getByRole("heading", { name: "Your testing, in focus.", exact: true })
    .waitFor();
  const shortcut = page.getByRole("link", {
    name: "Open documentation in a new tab",
    exact: true,
  });
  assert.equal(
    await shortcut.isVisible(),
    true,
    "Mobile Docs shortcut stays visible outside the scrollable tab strip",
  );
  const shortcutBox = await shortcut.boundingBox();
  assert.ok(
    shortcutBox &&
      shortcutBox.x >= 0 &&
      shortcutBox.x + shortcutBox.width <= 390,
  );
  const popupPromise = context.waitForEvent("page");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: /^Docs/ })
    .click();
  const docs = await popupPromise;
  await docs
    .getByRole("heading", { name: "Introduction", exact: true })
    .waitFor();
  assert.equal(
    page.url(),
    origin + "/app",
    "Docs opens separately without replacing the workspace",
  );
  await docs.close();
  for (const [route, heading] of [
    ["/app", "Your testing, in focus."],
    ["/", "Confidence. On the line."],
    ["/docs", "Introduction"],
  ]) {
    await checkpoint();
    await page.goto(origin + route);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    for (const img of await page.locator("img").all()) {
      assert.equal(
        await img.evaluate((el) => (el as HTMLImageElement).draggable),
        false,
      );
      assert.equal(
        await img.evaluate((el) => {
          const event = new DragEvent("dragstart", {
            bubbles: true,
            cancelable: true,
          });
          el.dispatchEvent(event);
          return event.defaultPrevented;
        }),
        true,
        "Generated images and brand images must reject dragging",
      );
      assert.equal(
        await img.evaluate((el) => (el as HTMLImageElement).naturalWidth > 0),
        true,
        "All images load",
      );
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "Design browser passed. Seven documentation guides, copy success/failure, searchable navigation, mobile menu, new-tab Docs, non-draggable artwork, WCAG and 320–2560px layouts.",
  );
} finally {
  if (collectCoverage) {
    await checkpoint(false);
    const file = ".data/browser-v8/coverage-browser.json";
    let existing: { snapshots: typeof snapshots } = { snapshots: [] };
    try {
      existing = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    existing.snapshots.push(...snapshots);
    await mkdir(".data/browser-v8", { recursive: true });
    await writeFile(file, JSON.stringify(existing));
  }
  await browser.close();
}
