import { describe, expect, it } from "vitest";
import {
  ReportParseError,
  detectFormat,
  parseReport,
  stableHash,
  toNewFindings,
} from "../src/index.js";
import { report } from "./fixtures.js";

describe("detectFormat and parseReport", () => {
  it.each([
    ["slither.json", "slither"],
    ["aderyn.json", "aderyn"],
    ["vault-v2-audit.md", "markdown"],
  ])("detects %s as %s from its content", (name, format) => {
    expect(detectFormat(report(name))).toBe(format);
    expect(parseReport(report(name), name).format).toBe(format);
  });

  it("gives a plain-language error for anything else", () => {
    expect(detectFormat('{"foo": 1}')).toBeUndefined();
    expect(() => parseReport("hello", "notes.txt")).toThrow(ReportParseError);
    expect(() => parseReport("hello", "notes.txt")).toThrow(
      /Slither JSON .* Aderyn JSON .* Markdown/,
    );
  });
});

describe("toNewFindings", () => {
  it("attaches findings to an audit as Open with empty history", () => {
    const [first] = toNewFindings(parseReport(report("vault-v2-audit.md")).findings, "audit-1");
    expect(first).toMatchObject({
      auditId: "audit-1",
      status: "Open",
      history: [],
      externalId: "C-01",
    });
  });
});

describe("stableHash", () => {
  it("is stable and sensitive to every part", () => {
    expect(stableHash("a", "b")).toBe(stableHash("a", "b"));
    expect(stableHash("a", "b")).toMatch(/^[0-9a-f]{16}$/);
    expect(stableHash("a", "b")).not.toBe(stableHash("ab"));
    expect(stableHash("a", "b")).not.toBe(stableHash("b", "a"));
  });
});
