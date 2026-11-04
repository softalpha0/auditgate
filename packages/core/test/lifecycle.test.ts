import { describe, expect, it } from "vitest";
import {
  FINDING_STATUSES,
  TransitionError,
  canTransition,
  transition,
  type Finding,
  type FindingStatus,
} from "../src/index.js";

const AT = "2026-10-29T10:00:00.000Z";

function finding(status: FindingStatus): Finding {
  return {
    id: "f1",
    auditId: "a1",
    externalId: "H-01",
    severity: "High",
    title: "Reentrancy in withdrawEth",
    description: "",
    file: "src/TokenVault.sol",
    source: "markdown",
    status,
    history: [],
  };
}

describe("finding lifecycle", () => {
  it.each<[FindingStatus, FindingStatus]>([
    ["Open", "InFix"],
    ["InFix", "FixedPendingRecheck"],
    ["FixedPendingRecheck", "Verified"],
    ["Verified", "Drifted"],
    ["Drifted", "InFix"],
    ["Open", "AcceptedRisk"],
    ["Drifted", "AcceptedRisk"],
  ])("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it("allows every state except Drifted itself to become Drifted", () => {
    for (const from of FINDING_STATUSES) {
      expect(canTransition(from, "Drifted")).toBe(from !== "Drifted");
    }
  });

  it.each<[FindingStatus, FindingStatus]>([
    ["Open", "Verified"],
    ["Open", "FixedPendingRecheck"],
    ["InFix", "Verified"],
    ["Drifted", "Verified"],
    ["Verified", "Open"],
    ["InFix", "AcceptedRisk"],
    ["Verified", "AcceptedRisk"],
    ["AcceptedRisk", "Open"],
  ])("rejects %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => transition(finding(from), { to, by: "u1", at: AT })).toThrow(TransitionError);
  });

  it("appends a history entry and leaves the input untouched", () => {
    const before = finding("Open");
    const after = transition(before, { to: "InFix", by: "u1", at: AT, note: "picked up" });

    expect(after.status).toBe("InFix");
    expect(after.history).toEqual([
      { at: AT, by: "u1", from: "Open", to: "InFix", note: "picked up" },
    ]);
    expect(before.status).toBe("Open");
    expect(before.history).toEqual([]);
  });

  it("requires a reason and an approver to accept a risk", () => {
    const f = finding("Open");
    expect(() => transition(f, { to: "AcceptedRisk", by: "u1", at: AT, approver: "u2" })).toThrow(
      /needs a reason/,
    );
    expect(() => transition(f, { to: "AcceptedRisk", by: "u1", at: AT, note: "ok" })).toThrow(
      /needs an approver/,
    );

    const accepted = transition(f, {
      to: "AcceptedRisk",
      by: "u1",
      at: AT,
      note: "Owner is a multisig",
      approver: "u2",
    });
    expect(accepted.status).toBe("AcceptedRisk");
    expect(accepted.history[0]?.note).toBe("Owner is a multisig (approved by u2)");
  });
});
