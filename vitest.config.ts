import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["apps/api/test/*.test.ts"],
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: [
        "packages/core/src/**/*.ts",
        "apps/api/src/bolna.ts",
        "apps/api/src/configuration.ts",
      ],
      reportsDirectory: "coverage/unit",
    },
  },
});
