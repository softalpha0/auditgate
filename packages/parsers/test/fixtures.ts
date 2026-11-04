import { readFileSync } from "node:fs";

/** Reads a committed report from demo/reports. These are real tool outputs, not hand-written. */
export function report(name: string): string {
  return readFileSync(new URL(`../../../demo/reports/${name}`, import.meta.url), "utf8");
}
