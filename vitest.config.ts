import { defineConfig } from "vitest/config";

// Vitest 4 removed vitest.workspace.ts. Projects are listed here instead.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/forge"],
  },
});
