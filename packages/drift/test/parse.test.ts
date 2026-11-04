import { describe, expect, it } from "vitest";
import { computeDrift, parseChangedFiles } from "../src/index.js";

describe("parseChangedFiles", () => {
  it("reads git diff --name-status output", () => {
    const text = [
      "M\tsrc/TokenVault.sol",
      "A\tsrc/New.sol",
      "D\tsrc/Old.sol",
      "R087\tsrc/PriceOracle.sol\tsrc/oracle/PriceOracle.sol",
      "C100\tsrc/A.sol\tsrc/ACopy.sol",
    ].join("\n");
    expect(parseChangedFiles(text)).toEqual([
      { status: "modified", oldPath: "src/TokenVault.sol", newPath: "src/TokenVault.sol" },
      { status: "added", newPath: "src/New.sol" },
      { status: "removed", oldPath: "src/Old.sol" },
      { status: "renamed", oldPath: "src/PriceOracle.sol", newPath: "src/oracle/PriceOracle.sol" },
      { status: "added", newPath: "src/ACopy.sol" },
    ]);
  });

  it("accepts bare paths, spaces instead of tabs, Windows line endings, blanks and comments", () => {
    expect(
      parseChangedFiles(
        "# changed since audit\r\n\r\n./src/RewardsDistributor.sol\r\nM   src/TokenVault.sol\r\n",
      ),
    ).toEqual([
      {
        status: "modified",
        oldPath: "src/RewardsDistributor.sol",
        newPath: "src/RewardsDistributor.sol",
      },
      { status: "modified", oldPath: "src/TokenVault.sol", newPath: "src/TokenVault.sol" },
    ]);
  });

  it("keeps paths with spaces when git separates columns with tabs", () => {
    expect(parseChangedFiles("M\tsrc/My Vault.sol")).toEqual([
      { status: "modified", oldPath: "src/My Vault.sol", newPath: "src/My Vault.sol" },
    ]);
  });

  it("feeds straight into computeDrift", () => {
    const report = computeDrift({
      auditedFiles: ["src/TokenVault.sol"],
      findings: [{ id: "h1", externalId: "H-01", file: "src/TokenVault.sol" }],
      changes: parseChangedFiles("M\tsrc/TokenVault.sol\nM\tREADME.md"),
    });
    expect(report.driftedFindings.map((d) => d.externalId)).toEqual(["H-01"]);
    expect(report.outOfScopeFiles).toEqual(["README.md"]);
  });
});
