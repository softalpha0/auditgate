import type { Finding } from "@auditgate/core";
import { parseReport, toNewFindings } from "@auditgate/parsers";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ISSUE_PROPERTY_KEY,
  bitbucketSourceUrl,
  createIssueBody,
  issueSummary,
  pickIssueTypeId,
  pickPriorityId,
  updateIssueFields,
} from "../src/index.js";

const md = readFileSync(
  new URL("../../../demo/reports/vault-v2-audit.md", import.meta.url),
  "utf8",
);
const findings = toNewFindings(parseReport(md).findings, "a1b2c3");
const byId = (id: string) => findings.find((f) => f.externalId === id) as Finding;

const audit = {
  id: "a1b2c3",
  name: "Vault v2 audit",
  repo: { workspace: "auditgate-demo", slug: "vault-v2" },
  auditedCommit: "3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e",
};
const priorities = ["Highest", "High", "Medium", "Low", "Lowest"].map((name, i) => ({
  id: String(i + 1),
  name,
}));

describe("bitbucketSourceUrl", () => {
  it("links to the file at the audited commit with the lines highlighted", () => {
    expect(bitbucketSourceUrl(audit, { file: "src/TokenVault.sol", lines: [36, 43] })).toBe(
      "https://bitbucket.org/auditgate-demo/vault-v2/src/3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e/src/TokenVault.sol#lines-36:43",
    );
    expect(bitbucketSourceUrl(audit, { file: "src/A B.sol", lines: [7, 7] })).toMatch(
      /src\/A%20B\.sol#lines-7$/,
    );
    expect(bitbucketSourceUrl(audit, { file: "src/A.sol" })).toMatch(/src\/A\.sol$/);
  });
});

describe("pickers", () => {
  it("maps severity to the project's priority names", () => {
    expect(pickPriorityId("Critical", priorities)).toBe("1");
    expect(pickPriorityId("High", priorities)).toBe("2");
    expect(pickPriorityId("Gas", priorities)).toBe("5");
    expect(pickPriorityId("Critical", [{ id: "9", name: "Blocker" }])).toBe("9");
    expect(pickPriorityId("Medium", [{ id: "9", name: "P1" }])).toBeUndefined();
  });

  it("prefers Bug, then Task, never a subtask", () => {
    expect(
      pickIssueTypeId([
        { id: "1", name: "Story" },
        { id: "2", name: "Bug" },
      ]),
    ).toBe("2");
    expect(
      pickIssueTypeId([
        { id: "1", name: "Subtask", subtask: true },
        { id: "3", name: "Task" },
      ]),
    ).toBe("3");
    expect(
      pickIssueTypeId([
        { id: "1", name: "Sub-task", subtask: true },
        { id: "4", name: "Story" },
      ]),
    ).toBe("4");
    expect(pickIssueTypeId([])).toBeUndefined();
  });

  it("caps the summary at 255 characters", () => {
    expect(issueSummary({ externalId: "H-01", title: "x".repeat(300) })).toHaveLength(255);
    expect(issueSummary({ externalId: "H-01", title: "Reentrancy  in\nwithdrawEth" })).toBe(
      "[H-01] Reentrancy in withdrawEth",
    );
  });
});

describe("createIssueBody", () => {
  const body = createIssueBody(byId("C-01"), audit, {
    projectId: "10000",
    issueTypeId: "10001",
    priorities,
    labels: true,
  });

  it("sets project, type, summary, labels, priority and the finding property", () => {
    expect(body.fields).toMatchObject({
      project: { id: "10000" },
      issuetype: { id: "10001" },
      summary: "[C-01] Anyone can set the oracle price",
      labels: ["auditgate", "sev-critical", "audit-a1b2c3"],
      priority: { id: "1" },
    });
    expect(body.properties).toEqual([
      {
        key: ISSUE_PROPERTY_KEY,
        value: {
          auditId: "a1b2c3",
          findingId: byId("C-01").id,
          externalId: "C-01",
          severity: "Critical",
          severityRank: 0,
          status: "Open",
          file: "src/PriceOracle.sol",
        },
      },
    ]);
  });

  it("writes a description with a source link, description and recommendation", () => {
    const json = JSON.stringify(body.fields.description);
    expect(json).toContain("src/PriceOracle.sol#L21-L25");
    expect(json).toContain("#lines-21:25");
    expect(json).toContain('"text":"Description"');
    expect(json).toContain('"text":"Recommendation"');
    expect(json).toContain("PriceOracle.setPrice");
    expect(
      body.fields.description.content.every(
        (b) => b.type !== "paragraph" || b.content === undefined || b.content.length > 0,
      ),
    ).toBe(true);
  });

  it("lists every location for a multi-file finding", () => {
    const json = JSON.stringify(
      createIssueBody(byId("L-01"), audit, { projectId: "1", issueTypeId: "1", labels: false })
        .fields.description,
    );
    expect(json).toContain("Locations: ");
    expect(json).toContain("src/RewardsDistributor.sol#L36");
  });

  it("leaves out labels and priority when the project's create screen doesn't have them", () => {
    const fields = updateIssueFields(byId("H-01"), audit, { labels: false });
    expect(fields).not.toHaveProperty("labels");
    expect(fields).not.toHaveProperty("priority");
    expect(fields).not.toHaveProperty("project");
  });

  it("says so when a finding has no location", () => {
    const noLocation = { ...byId("H-01"), file: "" };
    delete (noLocation as Partial<Finding>).lines;
    const json = JSON.stringify(
      createIssueBody(noLocation, audit, { projectId: "1", issueTypeId: "1", labels: true }).fields
        .description,
    );
    expect(json).toContain("not given in the report");
  });
});
