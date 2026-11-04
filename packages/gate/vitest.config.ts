import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "gate",
    include: ["test/**/*.test.ts"],
  },
});
