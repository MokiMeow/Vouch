import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "apps/api/test/*.test.ts",
      "packages/core/test/*.test.ts",
      "apps/web/src/features/**/*.test.ts",
    ],
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: [
        "packages/core/src/**/*.ts",
        "apps/api/src/providers/bolna/runtime.ts",
        "apps/api/src/campaigns/configuration.ts",
      ],
      reportsDirectory: "coverage/unit",
    },
  },
});
