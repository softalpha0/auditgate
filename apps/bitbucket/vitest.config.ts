import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "forge-bitbucket",
    include: ["test/**/*.test.ts"],
  },
});
