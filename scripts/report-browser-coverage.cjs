// Playwright coverage is checkpointed before full navigations, then merged from
// actual per-function ranges. Do not use blanket minified-bundle line coverage.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const requireC8 = createRequire(require.resolve("c8/package.json"));
const convert = requireC8("v8-to-istanbul");
const { createCoverageMap } = requireC8("istanbul-lib-coverage");
const { createContext } = requireC8("istanbul-lib-report");
const reports = requireC8("istanbul-reports");
async function main() {
  const { snapshots } = JSON.parse(
    fs.readFileSync(".data/browser-v8/coverage-browser.json", "utf8"),
  );
  if (!snapshots?.length)
    throw new Error("No browser coverage snapshots from the current run");
  const coverage = createCoverageMap({});
  for (const snapshot of snapshots)
    for (const entry of snapshot) {
      if (
        !entry.url.startsWith("http://127.0.0.1:4000/assets/") ||
        !entry.url.endsWith(".js")
      )
        continue;
      const file = path.resolve(
        "dist/web",
        new URL(entry.url).pathname.slice(1),
      );
      const converter = convert(file);
      await converter.load();
      converter.applyCoverage(entry.functions);
      const mapped = converter.toIstanbul();
      for (const key of Object.keys(mapped))
        if (!key.includes("/apps/web/src/")) delete mapped[key];
      coverage.merge(mapped);
    }
  if (!coverage.files().length)
    throw new Error("No frontend source coverage could be mapped");
  const context = createContext({
    dir: "coverage/browser",
    coverageMap: coverage,
  });
  reports.create("lcovonly").execute(context);
  reports.create("text").execute(context);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
