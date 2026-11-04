import { readFileSync } from "node:fs";
import { transition, type Finding } from "@auditgate/core";
import { computeDrift } from "@auditgate/drift";
import { parseReport, toNewFindings } from "@auditgate/parsers";
import { describe, expect, it } from "vitest";
import { evaluateGate } from "../src/index.js";

// The demo story, end to end, on the real sample report: import, fix, drift, gate.
const md = readFileSync(
  new URL("../../../demo/reports/vault-v2-audit.md", import.meta.url),
  "utf8",
);
const parsed = parseReport(md, "vault-v2-audit.md");
const AT = "2026-11-10T09:00:00.000Z";

function setStatus(findings: Finding[], externalId: string, path: Finding["status"][]): Finding[] {
  return findings.map((f) =>
    f.externalId === externalId
      ? path.reduce((acc, to) => transition(acc, { to, by: "dev", at: AT }), f)
      : f,
  );
}

describe("import -> fix -> drift -> gate on vault-v2", () => {
  const imported = toNewFindings(parsed.findings, "vault-v2");
  const auditedFiles = parsed.meta.scope ?? [];

  it("blocks right after import: 1 Critical and 3 High are open", () => {
    const result = evaluateGate(imported);
    expect(result.message).toBe("Blocked by AuditGate: 4 open (C-01, H-01, H-02, H-03).");
  });

  it("passes once the four serious findings are verified, even if a Medium-only file changed", () => {
    let findings = imported;
    for (const id of ["C-01", "H-01", "H-02", "H-03"]) {
      findings = setStatus(findings, id, ["InFix", "FixedPendingRecheck", "Verified"]);
    }
    // A change to a file with only Medium/Low findings doesn't block under the default rule.
    const drift = computeDrift({
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
    expect(drift.driftedFindings.map((d) => d.externalId)).toEqual(["M-02", "M-03", "L-01"]);
    expect(evaluateGate(findings, drift).pass).toBe(true);

    // With the stricter rule on, the same change blocks until someone re-reviews it.
    expect(evaluateGate(findings, drift, { blockOnUnreviewedChanges: true }).message).toBe(
      "Blocked by AuditGate: 1 audited file changed without re-review (src/RewardsDistributor.sol).",
    );
  });

  it("blocks again when a later PR edits the oracle after C-01 was verified", () => {
    let findings = imported;
    for (const id of ["C-01", "H-01", "H-02", "H-03"]) {
      findings = setStatus(findings, id, ["InFix", "FixedPendingRecheck", "Verified"]);
    }
    const drift = computeDrift({
      auditedFiles,
      findings,
      changes: [
        { status: "modified", oldPath: "src/PriceOracle.sol", newPath: "src/PriceOracle.sol" },
      ],
    });
    expect(evaluateGate(findings, drift).message).toBe("Blocked by AuditGate: 1 drifted (C-01).");
  });
});
