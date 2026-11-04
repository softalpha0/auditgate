import { describe, expect, it } from "vitest";
import { ReportParseError, parseSlither } from "../src/index.js";
import { report } from "./fixtures.js";

const raw = report("slither.json");

describe("parseSlither (real Slither 0.11.6 output)", () => {
  const result = parseSlither(raw);

  it("keeps every one of the 21 results", () => {
    expect(result.format).toBe("slither");
    expect(result.findings).toHaveLength(21);
    expect(result.warnings).toEqual([]);
  });

  it("maps impact to severity, with Optimization as Gas", () => {
    const counts: Record<string, number> = {};
    for (const f of result.findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    expect(counts).toEqual({ High: 6, Medium: 3, Low: 7, Informational: 1, Gas: 4 });
  });

  it("reads file, lines, contract and function from the primary element", () => {
    const reentrancy = result.findings.find((f) => f.description.includes("reentrancy-eth"));
    expect(reentrancy).toMatchObject({
      severity: "High",
      title: "Reentrancy in TokenVault.withdrawEth()",
      file: "src/TokenVault.sol",
      lines: [36, 43],
      contract: "TokenVault",
      fn: "withdrawEth",
      source: "slither",
      recommendation: expect.stringMatching(/^See https:\/\/github.com\/crytic\/slither\/wiki/),
    });
  });

  it("gives distinct ids to two results from the same detector in the same function", () => {
    const transfers = result.findings.filter(
      (f) => f.fn === "withdrawToken" && f.description.includes("unchecked-transfer"),
    );
    expect(transfers).toHaveLength(2);
    expect(transfers[0]?.id).not.toBe(transfers[1]?.id);
  });

  it("gives every finding a unique id and a readable external id", () => {
    expect(new Set(result.findings.map((f) => f.id)).size).toBe(21);
    expect(result.findings.map((f) => f.externalId).slice(0, 2)).toEqual(["SL-H-01", "SL-H-02"]);
    expect(result.findings.every((f) => /^SL-[CHMLIG]-\d{2}$/.test(f.externalId))).toBe(true);
  });

  it("is deterministic, so re-importing gives the same ids", () => {
    expect(parseSlither(raw)).toEqual(result);
    const reversed = JSON.parse(raw);
    reversed.results.detectors.reverse();
    expect(parseSlither(reversed).findings).toEqual(result.findings);
  });

  it("skips results in dependencies and says so", () => {
    const data = JSON.parse(raw);
    data.results.detectors[0].elements[0].source_mapping.is_dependency = true;
    const out = parseSlither(data);
    expect(out.findings).toHaveLength(20);
    expect(out.warnings).toEqual([
      expect.stringContaining("Skipped 1 Slither result(s) in dependencies"),
    ]);
  });

  it("rejects a failed run and files that aren't Slither output", () => {
    expect(() => parseSlither('{"success": false, "error": "solc not found"}')).toThrow(
      /solc not found/,
    );
    expect(() => parseSlither("not json")).toThrow(ReportParseError);
    expect(() => parseSlither("{}")).toThrow(/--json/);
  });
});
