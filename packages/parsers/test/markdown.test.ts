import { describe, expect, it } from "vitest";
import { ReportParseError, parseLocation, parseMarkdownReport } from "../src/index.js";
import { report } from "./fixtures.js";

describe("parseMarkdownReport (demo/reports/vault-v2-audit.md)", () => {
  const result = parseMarkdownReport(report("vault-v2-audit.md"));

  it("reads all 11 findings in order", () => {
    expect(result.findings.map((f) => f.externalId)).toEqual([
      "C-01",
      "H-01",
      "H-02",
      "H-03",
      "M-01",
      "M-02",
      "M-03",
      "L-01",
      "L-02",
      "L-03",
      "G-01",
    ]);
  });

  it("reads the header", () => {
    expect(result.meta).toEqual({
      name: "Vault v2 audit",
      auditor: "AuditGate demo (internal review)",
      scope: ["src/TokenVault.sol", "src/PriceOracle.sol", "src/RewardsDistributor.sol"],
    });
    // The sample report has no SHA yet, so the only warning is about that.
    expect(result.warnings).toEqual([expect.stringContaining("Commit line isn't a commit SHA")]);
  });

  it("reads every field of a finding", () => {
    const c01 = result.findings[0];
    expect(c01).toMatchObject({
      externalId: "C-01",
      severity: "Critical",
      title: "Anyone can set the oracle price",
      file: "src/PriceOracle.sol",
      lines: [21, 25],
      contract: "PriceOracle",
      fn: "setPrice",
      source: "markdown",
    });
    expect(c01?.description).toMatch(/^`setPrice` has no access control/);
    expect(c01?.description).toContain("test_C01_anyoneCanSetPrice");
    expect(c01?.recommendation).toMatch(/^Restrict `setPrice` to the owner/);
  });

  it("keeps a second location as an extra location", () => {
    const l01 = result.findings.find((f) => f.externalId === "L-01");
    expect(l01).toMatchObject({ file: "src/TokenVault.sol", lines: [56, 56] });
    expect(l01?.extraLocations).toEqual([{ file: "src/RewardsDistributor.sol", lines: [36, 36] }]);
  });

  it("uses the finding id alone for the stable id, so editing the text keeps the issue", () => {
    const edited = report("vault-v2-audit.md").replace(
      "Anyone can set the oracle price",
      "Oracle price is writable by anyone",
    );
    const again = parseMarkdownReport(edited);
    expect(again.findings[0]?.id).toBe(result.findings[0]?.id);
    expect(again.findings[0]?.title).toBe("Oracle price is writable by anyone");
  });
});

describe("parseMarkdownReport (TEMPLATE.md example)", () => {
  it("reads a real commit SHA from the header", () => {
    const template = report("TEMPLATE.md");
    const example = template.slice(template.indexOf("```markdown") + "```markdown".length);
    const result = parseMarkdownReport(example.slice(0, example.indexOf("```")));
    expect(result.meta.commit).toBe("3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e");
    expect(result.findings).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it("ignores finding-like headings inside code blocks", () => {
    // TEMPLATE.md shows "## [H-01]" inside a fenced example, and also has real ## headings.
    expect(() => parseMarkdownReport(report("TEMPLATE.md"))).toThrow(/No findings found/);
  });
});

describe("parseMarkdownReport edge cases", () => {
  const md = (body: string) => `# Test\r\n\r\n${body.replace(/\n/g, "\r\n")}`;

  it("falls back to the ID letter when Severity is missing, with a warning", () => {
    const r = parseMarkdownReport(md("## [M-07] Thing\n### Location: a.sol#L1"));
    expect(r.findings[0]?.severity).toBe("Medium");
    expect(r.warnings).toEqual([expect.stringContaining("used Medium from the ID")]);
  });

  it("lets the Severity line win over the ID letter, with a warning", () => {
    const r = parseMarkdownReport(
      md("## [M-01] Thing\n### Severity: **High**\n### Location: a.sol"),
    );
    expect(r.findings[0]?.severity).toBe("High");
    expect(r.warnings).toEqual([expect.stringContaining("the ID says Medium")]);
  });

  it("skips a finding with no severity at all", () => {
    const r = parseMarkdownReport(
      md("## [X-1] Thing\n### Location: a.sol\n## [H-01] Real\n### Location: a.sol"),
    );
    expect(r.findings.map((f) => f.externalId)).toEqual(["H-01"]);
    expect(r.warnings[0]).toMatch(/X-1.*Skipped/);
  });

  it("imports a finding with no location but warns that drift can't track it", () => {
    const r = parseMarkdownReport(md("## [C-01] No location\n### Severity: Critical"));
    expect(r.findings[0]).toMatchObject({ severity: "Critical", file: "" });
    expect(r.warnings[0]).toMatch(/no Location/);
  });

  it("keeps the first of two findings with the same ID", () => {
    const r = parseMarkdownReport(
      md("## [H-01] First\n### Location: a.sol\n## [h-01] Second\n### Location: b.sol"),
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.title).toBe("First");
    expect(r.warnings).toContainEqual(expect.stringMatching(/more than once/));
  });

  it("keeps unknown fields in the description and stops at a non-finding heading", () => {
    const r = parseMarkdownReport(
      md(
        "## [L-01] T\n### Location: a.sol\n### Description\nBody.\n### Proof of concept\nSteps.\n## Appendix\nNot part of L-01.",
      ),
    );
    expect(r.findings[0]?.description).toBe("Body.\n\n**Proof of concept**\n\nSteps.");
  });

  it("warns when a location is outside the scope list", () => {
    const r = parseMarkdownReport(md("Scope: src/A.sol\n\n## [H-01] T\n### Location: src/B.sol"));
    expect(r.meta.scope).toEqual(["src/A.sol"]);
    expect(r.warnings).toContainEqual(
      expect.stringContaining("src/B.sol isn't in the report's scope"),
    );
  });

  it("rejects empty reports and reports with no findings", () => {
    expect(() => parseMarkdownReport("  ")).toThrow(ReportParseError);
    expect(() => parseMarkdownReport("# Just a title\n\nSome text.")).toThrow(/No findings found/);
  });
});

describe("parseLocation", () => {
  it.each([
    ["src/A.sol#L10-L20", { file: "src/A.sol", lines: [10, 20] }],
    ["src/A.sol#L10-20", { file: "src/A.sol", lines: [10, 20] }],
    ["src/A.sol#L7", { file: "src/A.sol", lines: [7, 7] }],
    ["`./src/A.sol:3-9`", { file: "src/A.sol", lines: [3, 9] }],
    ["src\\nested\\A.sol", { file: "src/nested/A.sol" }],
    ["src/A.sol#L20-L10", { file: "src/A.sol", lines: [10, 20] }],
  ])("%s", (input, expected) => {
    expect(parseLocation(input)).toEqual(expected);
  });

  it("returns undefined for an empty string", () => {
    expect(parseLocation(" ")).toBeUndefined();
  });
});
