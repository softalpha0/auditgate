import { transition } from "@auditgate/core";
import { parseReport } from "@auditgate/parsers";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentHash, mergeImport, needsSync, type StoredFinding } from "../src/index.js";

const md = readFileSync(
  new URL("../../../demo/reports/vault-v2-audit.md", import.meta.url),
  "utf8",
);
const parsed = parseReport(md).findings;

function synced(findings: StoredFinding[]): StoredFinding[] {
  return findings.map((f, i) => ({ ...f, jiraKey: `VAULT-${i + 1}`, syncedHash: contentHash(f) }));
}

describe("mergeImport", () => {
  it("adds everything on the first import", () => {
    const result = mergeImport([], parsed, "a1");
    expect(result.added).toHaveLength(11);
    expect(result.findings.every((f) => f.status === "Open" && f.auditId === "a1")).toBe(true);
    expect(result.findings.every(needsSync)).toBe(true);
  });

  it("re-importing the same report changes nothing and needs no Jira writes", () => {
    const first = synced(mergeImport([], parsed, "a1").findings);
    const again = mergeImport(first, parseReport(md).findings, "a1");
    expect(again).toMatchObject({ added: [], changed: [], missing: [] });
    expect(again.unchanged).toHaveLength(11);
    expect(again.findings.filter(needsSync)).toEqual([]);
    expect(again.findings.map((f) => f.jiraKey)).toEqual(first.map((f) => f.jiraKey));
  });

  it("keeps status, history and the Jira key when the report text changes", () => {
    let first = synced(mergeImport([], parsed, "a1").findings);
    first = first.map((f) =>
      f.externalId === "H-01" ? transition(f, { to: "InFix", by: "u1", at: "t" }) : f,
    );

    const edited = md.replace(
      "Reentrancy in withdrawEth lets a depositor drain the vault",
      "Reentrancy in withdrawEth",
    );
    const result = mergeImport(first, parseReport(edited).findings, "a1");
    const h01 = result.findings.find((f) => f.externalId === "H-01");

    expect(result.changed).toEqual(["H-01"]);
    expect(h01).toMatchObject({
      title: "Reentrancy in withdrawEth",
      status: "InFix",
      jiraKey: "VAULT-2",
    });
    expect(h01?.history).toHaveLength(1);
    expect(result.findings.filter(needsSync).map((f) => f.externalId)).toEqual(["H-01"]);
  });

  it("keeps findings that disappeared from the report and reports them", () => {
    const first = synced(mergeImport([], parsed, "a1").findings);
    const trimmed = md.slice(0, md.indexOf("## [G-01]"));
    const result = mergeImport(first, parseReport(trimmed).findings, "a1");
    expect(result.missing).toEqual(["G-01"]);
    expect(result.findings).toHaveLength(11);
  });

  it("ignores duplicate ids within one import", () => {
    expect(mergeImport([], [...parsed, ...parsed], "a1").findings).toHaveLength(11);
  });
});
