import { describe, expect, it } from "vitest";
import { computeDrift, fromBitbucketDiffstat, type DriftFinding } from "../src/index.js";

// Mirrors the demo repo: three audited contracts, an interface and tests outside scope.
const auditedFiles = ["src/TokenVault.sol", "src/PriceOracle.sol", "src/RewardsDistributor.sol"];
const findings: DriftFinding[] = [
  { id: "c01", externalId: "C-01", file: "src/PriceOracle.sol" },
  { id: "h01", externalId: "H-01", file: "src/TokenVault.sol" },
  { id: "m02", externalId: "M-02", file: "src/RewardsDistributor.sol" },
  {
    id: "l01",
    externalId: "L-01",
    file: "src/TokenVault.sol",
    extraLocations: [{ file: "src/RewardsDistributor.sol" }],
  },
];

describe("computeDrift", () => {
  it("reports nothing when nothing changed", () => {
    expect(computeDrift({ auditedFiles, findings, changes: [] })).toEqual({
      changedFiles: [],
      outOfScopeFiles: [],
      driftedFindings: [],
    });
  });

  it("drifts every finding in a modified audited file, including extra locations", () => {
    const report = computeDrift({
      auditedFiles,
      findings,
      changes: [
        {
          status: "modified",
          oldPath: "src/RewardsDistributor.sol",
          newPath: "src/RewardsDistributor.sol",
        },
      ],
    });
    expect(report.changedFiles).toEqual([
      { path: "src/RewardsDistributor.sol", status: "modified" },
    ]);
    expect(report.driftedFindings).toEqual([
      { id: "m02", externalId: "M-02", files: ["src/RewardsDistributor.sol"] },
      { id: "l01", externalId: "L-01", files: ["src/RewardsDistributor.sol"] },
    ]);
  });

  it("treats a rename of an audited file as drift and records the new path", () => {
    const report = computeDrift({
      auditedFiles,
      findings,
      changes: [
        {
          status: "renamed",
          oldPath: "src/PriceOracle.sol",
          newPath: "src/oracle/PriceOracle.sol",
        },
      ],
    });
    expect(report.changedFiles).toEqual([
      { path: "src/PriceOracle.sol", status: "renamed", renamedTo: "src/oracle/PriceOracle.sol" },
    ]);
    expect(report.driftedFindings.map((d) => d.externalId)).toEqual(["C-01"]);
  });

  it("treats deleting an audited file as drift", () => {
    const report = computeDrift({
      auditedFiles,
      findings,
      changes: [{ status: "removed", oldPath: "src/TokenVault.sol" }],
    });
    expect(report.changedFiles).toEqual([{ path: "src/TokenVault.sol", status: "removed" }]);
    expect(report.driftedFindings.map((d) => d.externalId)).toEqual(["H-01", "L-01"]);
  });

  it("never drifts on changes outside the audit scope", () => {
    const report = computeDrift({
      auditedFiles,
      findings,
      changes: [
        { status: "modified", oldPath: "test/Exploits.t.sol", newPath: "test/Exploits.t.sol" },
        { status: "added", newPath: "src/NewFeature.sol" },
        { status: "modified", oldPath: "README.md", newPath: "README.md" },
      ],
    });
    expect(report.changedFiles).toEqual([]);
    expect(report.driftedFindings).toEqual([]);
    expect(report.outOfScopeFiles).toEqual([
      "README.md",
      "src/NewFeature.sol",
      "test/Exploits.t.sol",
    ]);
  });

  it("reports a changed audited file that has no findings, so the gate can decide about it", () => {
    const report = computeDrift({
      auditedFiles: [...auditedFiles, "src/Math.sol"],
      findings,
      changes: [{ status: "modified", oldPath: "src/Math.sol", newPath: "src/Math.sol" }],
    });
    expect(report.changedFiles).toEqual([{ path: "src/Math.sol", status: "modified" }]);
    expect(report.driftedFindings).toEqual([]);
  });

  it("counts a finding's own file as in scope even if the scope list misses it", () => {
    const report = computeDrift({
      auditedFiles: [],
      findings,
      changes: [
        { status: "modified", oldPath: "./src/PriceOracle.sol", newPath: "./src/PriceOracle.sol" },
      ],
    });
    expect(report.driftedFindings.map((d) => d.externalId)).toEqual(["C-01"]);
  });

  it("treats an audited path that is added back as changed", () => {
    const report = computeDrift({
      auditedFiles,
      findings: [],
      changes: [{ status: "added", newPath: "src/PriceOracle.sol" }],
    });
    expect(report.changedFiles).toEqual([{ path: "src/PriceOracle.sol", status: "added" }]);
  });

  it("ignores findings with no file", () => {
    const report = computeDrift({
      auditedFiles,
      findings: [{ id: "x", externalId: "C-09", file: "" }],
      changes: [
        { status: "modified", oldPath: "src/TokenVault.sol", newPath: "src/TokenVault.sol" },
      ],
    });
    expect(report.driftedFindings).toEqual([]);
  });
});

describe("fromBitbucketDiffstat", () => {
  it("converts Bitbucket's diffstat values", () => {
    expect(
      fromBitbucketDiffstat([
        { status: "modified", old: { path: "src/A.sol" }, new: { path: "src/A.sol" } },
        { status: "added", old: null, new: { path: "src/B.sol" } },
        { status: "removed", old: { path: "src/C.sol" }, new: null },
        { status: "renamed", old: { path: "src/D.sol" }, new: { path: "src/E.sol" } },
        { status: "merge conflict", old: { path: "src/F.sol" }, new: { path: "src/F.sol" } },
        { status: "modified", old: null, new: null },
      ]),
    ).toEqual([
      { status: "modified", oldPath: "src/A.sol", newPath: "src/A.sol" },
      { status: "added", newPath: "src/B.sol" },
      { status: "removed", oldPath: "src/C.sol" },
      { status: "renamed", oldPath: "src/D.sol", newPath: "src/E.sol" },
      { status: "modified", oldPath: "src/F.sol", newPath: "src/F.sol" },
    ]);
  });
});
