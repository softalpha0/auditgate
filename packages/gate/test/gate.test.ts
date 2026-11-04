import type { FindingStatus, Severity } from "@auditgate/core";
import type { DriftReport } from "@auditgate/drift";
import { describe, expect, it } from "vitest";
import { evaluateGate, type GateFinding } from "../src/index.js";

function f(externalId: string, severity: Severity, status: FindingStatus): GateFinding {
  return { id: externalId.toLowerCase(), externalId, severity, status };
}

const URL = "https://example.atlassian.net/jira/apps/auditgate";

function driftOf(ids: string[], files = ["src/TokenVault.sol"]): DriftReport {
  return {
    changedFiles: files.map((path) => ({ path, status: "modified" })),
    outOfScopeFiles: [],
    driftedFindings: ids.map((id) => ({ id, externalId: id.toUpperCase(), files })),
  };
}

describe("evaluateGate", () => {
  it("passes with no findings", () => {
    expect(evaluateGate([])).toEqual({
      pass: true,
      message: "AuditGate: no open Critical or High findings.",
      blocking: [],
      accepted: [],
      unreviewedFiles: [],
    });
  });

  it.each<FindingStatus>(["Open", "InFix", "FixedPendingRecheck", "Drifted"])(
    "blocks a High finding that is %s",
    (status) => {
      expect(evaluateGate([f("H-01", "High", status)]).pass).toBe(false);
    },
  );

  it.each<FindingStatus>(["Verified", "AcceptedRisk"])(
    "passes a High finding that is %s",
    (status) => {
      expect(evaluateGate([f("H-01", "High", status)]).pass).toBe(true);
    },
  );

  it("never blocks on Medium and below", () => {
    const result = evaluateGate([
      f("M-01", "Medium", "Open"),
      f("L-01", "Low", "Drifted"),
      f("I-01", "Informational", "Open"),
      f("G-01", "Gas", "Open"),
    ]);
    expect(result.pass).toBe(true);
  });

  it("groups blocking findings by status, most severe first, with the dashboard link", () => {
    const result = evaluateGate(
      [
        f("H-03", "High", "Open"),
        f("C-01", "Critical", "Open"),
        f("H-02", "High", "InFix"),
        f("H-01", "High", "FixedPendingRecheck"),
        f("H-04", "High", "Drifted"),
        f("H-05", "High", "AcceptedRisk"),
        f("M-01", "Medium", "Open"),
      ],
      undefined,
      { dashboardUrl: URL },
    );
    expect(result).toEqual({
      pass: false,
      message: `Blocked by AuditGate: 2 open (C-01, H-03), 1 in fix (H-02), 1 awaiting re-check (H-01), 1 drifted (H-04). Accepted risk: H-05. See ${URL}`,
      blocking: ["C-01", "H-01", "H-02", "H-03", "H-04"],
      accepted: ["H-05"],
      unreviewedFiles: [],
    });
  });

  it("treats a Verified finding whose code changed as drifted, even if the store says Verified", () => {
    const result = evaluateGate([f("H-01", "High", "Verified")], driftOf(["h-01"]));
    expect(result.pass).toBe(false);
    expect(result.message).toBe("Blocked by AuditGate: 1 drifted (H-01).");
  });

  it("treats an accepted risk whose code changed as drifted", () => {
    const result = evaluateGate([f("H-01", "High", "AcceptedRisk")], driftOf(["h-01"]));
    expect(result.pass).toBe(false);
    expect(result.accepted).toEqual([]);
  });

  it("keeps an awaiting re-check finding in its own group even when its file changed", () => {
    // A fix always edits the audited file. The message should say "awaiting re-check", not "drifted".
    const result = evaluateGate([f("H-01", "High", "FixedPendingRecheck")], driftOf(["h-01"]));
    expect(result.message).toBe("Blocked by AuditGate: 1 awaiting re-check (H-01).");
  });

  it("passes with accepted risk and names it", () => {
    const result = evaluateGate([f("H-02", "High", "AcceptedRisk"), f("H-01", "High", "Verified")]);
    expect(result.pass).toBe(true);
    expect(result.message).toBe(
      "AuditGate: no open Critical or High findings. Accepted risk: H-02.",
    );
  });

  it("shortens long lists", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      f(`H-${String(i + 1).padStart(2, "0")}`, "High", "Open"),
    );
    expect(evaluateGate(many, undefined, { maxKeysPerGroup: 3 }).message).toBe(
      "Blocked by AuditGate: 11 open (H-01, H-02, H-03 +8 more).",
    );
  });

  describe("blockOnUnreviewedChanges", () => {
    const drift = driftOf([], ["src/Math.sol"]);

    it("is off by default: a changed audited file with no serious findings passes", () => {
      expect(evaluateGate([], drift).pass).toBe(true);
    });

    it("blocks on any changed audited file when turned on", () => {
      const result = evaluateGate([], drift, { blockOnUnreviewedChanges: true });
      expect(result).toMatchObject({
        pass: false,
        message: "Blocked by AuditGate: 1 audited file changed without re-review (src/Math.sol).",
        unreviewedFiles: ["src/Math.sol"],
      });
    });

    it("passes once the change has been re-reviewed at this commit", () => {
      expect(
        evaluateGate([], drift, { blockOnUnreviewedChanges: true, changesReviewed: true }).pass,
      ).toBe(true);
    });
  });
});
