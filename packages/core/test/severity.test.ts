import { describe, expect, it } from "vitest";
import {
  SEVERITIES,
  compareSeverity,
  isGatingSeverity,
  severityFromExternalId,
} from "../src/index.js";

describe("severity", () => {
  it.each([
    ["C-01", "Critical"],
    ["H-03", "High"],
    ["m-12", "Medium"],
    ["L-1", "Low"],
    ["I-02", "Informational"],
    ["G-01", "Gas"],
  ])("reads %s as %s", (id, severity) => {
    expect(severityFromExternalId(id)).toBe(severity);
  });

  it.each(["X-01", "H01", "H-", "HIGH-01", ""])("returns undefined for %j", (id) => {
    expect(severityFromExternalId(id)).toBeUndefined();
  });

  it("only Critical and High gate a merge", () => {
    expect(SEVERITIES.filter(isGatingSeverity)).toEqual(["Critical", "High"]);
  });

  it("sorts most severe first", () => {
    expect(["Low", "Critical", "Gas", "High"].sort(compareSeverity as never)).toEqual([
      "Critical",
      "High",
      "Low",
      "Gas",
    ]);
  });
});
