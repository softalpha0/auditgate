import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "drift",
    include: ["test/**/*.test.ts"],
  },
});
