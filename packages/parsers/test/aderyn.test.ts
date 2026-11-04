import { describe, expect, it } from "vitest";
import { ReportParseError, parseAderyn } from "../src/index.js";
import { report } from "./fixtures.js";

const raw = report("aderyn.json");

describe("parseAderyn (real Aderyn 0.6.8 output)", () => {
  const result = parseAderyn(raw);

  it("makes one finding per issue and file: 3 High, 13 Low", () => {
    expect(result.format).toBe("aderyn");
    expect(result.warnings).toEqual([]);
    expect(result.findings.filter((f) => f.severity === "High")).toHaveLength(3);
    expect(result.findings.filter((f) => f.severity === "Low")).toHaveLength(13);
  });

  it("spans the instance lines and lists every instance", () => {
    const reentrancy = result.findings.find((f) => f.title.startsWith("Reentrancy"));
    expect(reentrancy).toMatchObject({
      severity: "High",
      file: "src/TokenVault.sol",
      lines: [39, 53],
      source: "aderyn",
    });
    expect(reentrancy?.description).toContain("- src/TokenVault.sol#L39");
    expect(reentrancy?.description).toContain("- src/TokenVault.sol#L53");
  });

  it("splits an issue that covers two files into two findings", () => {
    const unchecked = result.findings.filter((f) => f.title === "Unchecked Return");
    expect(unchecked.map((f) => f.file).sort()).toEqual([
      "src/RewardsDistributor.sol",
      "src/TokenVault.sol",
    ]);
  });

  it("is deterministic and gives unique ids", () => {
    expect(parseAderyn(raw)).toEqual(result);
    expect(new Set(result.findings.map((f) => f.id)).size).toBe(result.findings.length);
    expect(result.findings[0]?.externalId).toBe("AD-H-01");
  });

  it("rejects files that aren't Aderyn output", () => {
    expect(() => parseAderyn("{")).toThrow(ReportParseError);
    expect(() => parseAderyn('{"results": {}}')).toThrow(/high_issues/);
  });
});
