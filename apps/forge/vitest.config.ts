import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "forge-jira",
    include: ["test/**/*.test.ts"],
  },
});
