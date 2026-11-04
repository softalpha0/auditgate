import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "jira",
    include: ["test/**/*.test.ts"],
  },
});
