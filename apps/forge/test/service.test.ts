import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CreateAuditInput } from "../src/shared/contract";
import {
  changeStatus,
  checkChange,
  createAudit,
  getAudit,
  getPanel,
  listAudits,
  manualTransitions,
  previewReport,
  reimport,
  runImport,
  type Caller,
} from "../src/backend/service";
import { makeDeps } from "./fakes";

const report = (name: string) =>
  readFileSync(new URL(`../../../demo/reports/${name}`, import.meta.url), "utf8");
const md = report("vault-v2-audit.md");
const SHA = "3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e";
const caller: Caller = { projectId: "10000", projectKey: "VAULT", accountId: "user-1" };

function input(overrides: Partial<CreateAuditInput> = {}): CreateAuditInput {
  return {
    name: "Vault v2 audit",
    auditor: "Internal",
    workspace: "auditgate-demo",
    repoSlug: "vault-v2",
    auditedCommit: SHA,
    scope: [],
    report: {
      fileName: "vault-v2-audit.md",
      data: `data:text/markdown;base64,${Buffer.from(md).toString("base64")}`,
    },
    blockOnUnreviewedChanges: true,
    ...overrides,
  };
}

async function importedAudit() {
  const ctx = makeDeps();
  const summary = await createAudit(ctx.deps, caller, input());
  await runImport(ctx.deps, ctx.jobs.shift()!);
  return { ...ctx, auditId: summary.id };
}

describe("previewReport", () => {
  it("summarises a report before anything is created", () => {
    const preview = previewReport({ fileName: "slither.json", data: report("slither.json") });
    expect(preview).toMatchObject({
      format: "slither",
      total: 21,
      bySeverity: { High: 6, Medium: 3, Low: 7, Informational: 1, Gas: 4 },
      warnings: [],
    });
    expect(preview.files).toEqual([
      "src/PriceOracle.sol",
      "src/RewardsDistributor.sol",
      "src/TokenVault.sol",
    ]);
  });

  it("explains unreadable files in plain words", () => {
    expect(() => previewReport({ fileName: "x.pdf", data: "%PDF-1.7 ..." })).toThrow(
      /can't read this file/,
    );
    expect(() => previewReport({ fileName: "", data: "" })).toThrow(/Choose a report file/);
  });
});

describe("createAudit", () => {
  it("rejects a short SHA and other bad input with every problem listed", async () => {
    const { deps } = makeDeps();
    await expect(
      createAudit(
        deps,
        caller,
        input({ name: " ", auditedCommit: "3f1c2a9", workspace: "has space" }),
      ),
    ).rejects.toThrow(/name.*Bitbucket workspace.*40-character SHA/s);
  });

  it("refuses when the user can't create issues in the project", async () => {
    const { deps } = makeDeps({ userJira: { canCreateIssues: async () => false } });
    await expect(createAudit(deps, caller, input())).rejects.toThrow(/permission to create issues/);
  });

  it("stores the audit and findings, takes scope from the report, and queues the import", async () => {
    const { deps, store, jobs } = makeDeps();
    const summary = await createAudit(deps, caller, input());
    expect(summary).toMatchObject({
      total: 11,
      gate: { pass: false },
      import: { state: "queued", total: 11 },
    });
    expect(jobs).toEqual([{ projectId: "10000", auditId: summary.id }]);
    const audit = await store.getAudit("10000", summary.id);
    expect(audit?.auditedFiles).toEqual([
      "src/TokenVault.sol",
      "src/PriceOracle.sol",
      "src/RewardsDistributor.sol",
    ]);
    expect(audit?.settings.blockOnUnreviewedChanges).toBe(true);
    expect(store.findings.size).toBe(11);
  });
});

describe("runImport", () => {
  it("creates one issue per finding with labels, priority and the finding property", async () => {
    const { jira, store, auditId, deps } = await importedAudit();
    expect(jira.issues).toHaveLength(11);
    expect(jira.bulkCalls).toBe(1);
    const c01 = jira.issues.find((i) => i.property.externalId === "C-01");
    expect(c01?.fields).toMatchObject({
      summary: "[C-01] Anyone can set the oracle price",
      labels: ["auditgate", "sev-critical", `audit-${auditId}`],
      priority: { id: "1" },
    });
    expect(store.links.size).toBe(11);
    const detail = await getAudit(deps, "10000", auditId);
    expect(detail.summary.import).toMatchObject({ state: "done", created: 11, failed: 0 });
    expect(detail.findings.every((f) => f.jiraKey)).toBe(true);
    expect(detail.findings.map((f) => f.externalId).slice(0, 4)).toEqual([
      "C-01",
      "H-01",
      "H-02",
      "H-03",
    ]);
  });

  it("is safe to run twice: the second run creates nothing", async () => {
    const { jira, deps, auditId } = await importedAudit();
    await runImport(deps, { projectId: "10000", auditId });
    expect(jira.issues).toHaveLength(11);
    expect(jira.updates).toEqual([]);
  });

  it("recovers after a crash between Jira creating issues and AuditGate saving the keys", async () => {
    const { deps, jira, jobs, store } = makeDeps();
    const { id } = await createAudit(deps, caller, input());
    jira.crashAfterCreate = true;
    await runImport(deps, jobs.shift()!);
    expect((await store.getAudit("10000", id))?.import.state).toBe("failed");
    expect(jira.issues).toHaveLength(11);

    await runImport(deps, { projectId: "10000", auditId: id }); // the platform's retry
    expect(jira.issues).toHaveLength(11);
    expect((await store.listFindings(id)).every((f) => f.jiraKey)).toBe(true);
    expect(store.links.size).toBe(11);
  });

  it("retries without labels and priority when the create screen doesn't have them", async () => {
    const { deps, jira, jobs, store } = makeDeps();
    jira.rejectLabels = true;
    const { id } = await createAudit(deps, caller, input());
    await runImport(deps, jobs.shift()!);
    expect(jira.issues).toHaveLength(11);
    expect(jira.issues.every((i) => !i.fields.labels && !i.fields.priority)).toBe(true);
    const audit = await store.getAudit("10000", id);
    expect(audit?.import.state).toBe("done");
    expect(audit?.import.messages[0]).toMatch(/without labels or priority/);
  });

  it("splits large reports into batches of 50", async () => {
    const big = Array.from(
      { length: 120 },
      (_, i) =>
        `## [L-${i + 1}] Finding ${i + 1}\n### Severity: Low\n### Location: src/A.sol#L${i + 1}`,
    ).join("\n\n");
    const { deps, jira, jobs } = makeDeps();
    await createAudit(
      deps,
      caller,
      input({ report: { fileName: "big.md", data: `# Big\n\n${big}` } }),
    );
    await runImport(deps, jobs.shift()!);
    expect(jira.issues).toHaveLength(120);
    expect(jira.bulkCalls).toBe(3);
  });
});

describe("reimport", () => {
  it("does nothing for an identical report and says so", async () => {
    const { deps, jobs, auditId, jira } = await importedAudit();
    const summary = await reimport(deps, caller, {
      auditId,
      report: { fileName: "r.md", data: md },
    });
    expect(summary.import).toMatchObject({
      state: "done",
      messages: ["Nothing changed since the last import."],
    });
    expect(jobs).toEqual([]);
    expect(jira.issues).toHaveLength(11);
  });

  it("updates only the issues whose findings changed, and creates new ones", async () => {
    const { deps, jobs, auditId, jira, store } = await importedAudit();
    const edited =
      md.replace("Anyone can set the oracle price", "Oracle price can be set by anyone") +
      "\n\n## [M-04] Missing event on price change\n### Severity: Medium\n### Location: src/PriceOracle.sol#L21-L25\n";
    await reimport(deps, caller, { auditId, report: { fileName: "r.md", data: edited } });
    await runImport(deps, jobs.shift()!);

    expect(jira.issues).toHaveLength(12);
    expect(jira.updates).toEqual(["VAULT-1"]);
    expect(jira.issues[0]?.fields.summary).toBe("[C-01] Oracle price can be set by anyone");
    const audit = await store.getAudit("10000", auditId);
    expect(audit?.lastImport).toMatchObject({ added: ["M-04"], changed: ["C-01"], missing: [] });
    expect(audit?.import).toMatchObject({ state: "done", created: 1, updated: 1 });
  });

  it("won't start while an import is still running", async () => {
    const { deps } = makeDeps();
    const { id } = await createAudit(deps, caller, input());
    await expect(
      reimport(deps, caller, { auditId: id, report: { fileName: "r.md", data: md } }),
    ).rejects.toThrow(/still running/);
  });
});

describe("issue panel", () => {
  it("shows the finding with links to the audited commit", async () => {
    const { deps, jira } = await importedAudit();
    const view = await getPanel(deps, jira.issues[0]!.id);
    expect(view?.finding).toMatchObject({
      externalId: "C-01",
      severity: "Critical",
      status: "Open",
      contract: "PriceOracle",
      fn: "setPrice",
      locations: [
        {
          label: "src/PriceOracle.sol#L21-L25",
          url: expect.stringContaining(`/src/${SHA}/src/PriceOracle.sol#lines-21:25`),
        },
      ],
    });
    expect(view?.allowedTransitions).toEqual(["InFix", "AcceptedRisk"]);
    expect(await getPanel(deps, "99999")).toBeNull();
  });

  it("changes status, records history and updates the issue property", async () => {
    const { deps, jira } = await importedAudit();
    const issue = jira.issues[1]!;
    const view = await changeStatus(deps, issue.id, "user-2", { to: "InFix", note: "PR #4" });
    expect(view.finding.status).toBe("InFix");
    expect(view.finding.history).toEqual([
      { at: expect.any(String), by: "user-2", from: "Open", to: "InFix", note: "PR #4" },
    ]);
    expect(view.allowedTransitions).toEqual(["FixedPendingRecheck"]);
    expect(issue.property.status).toBe("InFix");
  });

  it("needs a reason and an approver to accept a risk, and never offers Verified or Drifted", async () => {
    const { deps, jira } = await importedAudit();
    const id = jira.issues[0]!.id;
    await expect(changeStatus(deps, id, "u", { to: "AcceptedRisk", note: "fine" })).rejects.toThrow(
      /approver/,
    );
    await expect(changeStatus(deps, id, "u", { to: "Verified" })).rejects.toThrow(/can't move/);
    const accepted = await changeStatus(deps, id, "u", {
      to: "AcceptedRisk",
      note: "Multisig owner",
      approver: "lead",
    });
    expect(accepted.finding.status).toBe("AcceptedRisk");
    expect(manualTransitions("FixedPendingRecheck")).toEqual([]);
  });

  it("feeds the gate: accepting the Critical and fixing the Highs still blocks until re-checked", async () => {
    const { deps, jira } = await importedAudit();
    const byExt = (e: string) => jira.issues.find((i) => i.property.externalId === e)!.id;
    await changeStatus(deps, byExt("C-01"), "u", {
      to: "AcceptedRisk",
      note: "Owner-only in prod",
      approver: "lead",
    });
    for (const id of ["H-01", "H-02", "H-03"]) {
      await changeStatus(deps, byExt(id), "u", { to: "InFix" });
      await changeStatus(deps, byExt(id), "u", { to: "FixedPendingRecheck" });
    }
    const [summary] = await listAudits(deps, "10000");
    expect(summary?.gate.message).toBe(
      "Blocked by AuditGate: 3 awaiting re-check (H-01, H-02, H-03). Accepted risk: C-01.",
    );
  });
});

describe("checkChange (what the merge check would say, without Bitbucket)", () => {
  it("names drifted findings and blocks on an audited file changed without re-review", async () => {
    const { deps, auditId } = await importedAudit();
    const result = await checkChange(deps, "10000", {
      auditId,
      changedFiles: "M\tsrc/RewardsDistributor.sol\nM\tREADME.md\nA\ttest/New.t.sol",
    });
    expect(result.filesRead).toBe(3);
    expect(result.comparedTo).toBe(SHA);
    expect(result.changedAuditedFiles).toEqual([
      {
        path: "src/RewardsDistributor.sol",
        status: "modified",
        findings: ["M-02", "M-03", "L-01"],
      },
    ]);
    expect(result.outOfScopeFiles).toEqual(["README.md", "test/New.t.sol"]);
    expect(result.gate.pass).toBe(false);
    expect(result.gate.unreviewedFiles).toEqual(["src/RewardsDistributor.sol"]);
    expect(result.gate.message).toBe(
      "Blocked by AuditGate: 4 open (C-01, H-01, H-02, H-03), 1 audited file changed without re-review (src/RewardsDistributor.sol).",
    );
  });

  it("treats a verified finding whose file changed as drifted", async () => {
    const { deps, jira, auditId } = await importedAudit();
    const byExt = (e: string) => jira.issues.find((i) => i.property.externalId === e)!.id;
    for (const id of ["H-01", "H-02", "H-03"]) {
      await changeStatus(deps, byExt(id), "u", {
        to: "AcceptedRisk",
        note: "demo",
        approver: "lead",
      });
    }
    await changeStatus(deps, byExt("C-01"), "u", {
      to: "AcceptedRisk",
      note: "demo",
      approver: "lead",
    });
    const result = await checkChange(deps, "10000", {
      auditId,
      changedFiles: "src/PriceOracle.sol",
    });
    expect(result.gate.blocking).toEqual(["C-01"]);
    expect(result.gate.message).toMatch(/^Blocked by AuditGate: 1 drifted \(C-01\)/);
  });

  it("passes when nothing in scope changed and no serious finding is open", async () => {
    const { deps, jira, auditId } = await importedAudit();
    for (const issue of jira.issues.filter((i) => i.property.severityRank <= 1)) {
      await changeStatus(deps, issue.id, "u", {
        to: "AcceptedRisk",
        note: "demo",
        approver: "lead",
      });
    }
    const result = await checkChange(deps, "10000", { auditId, changedFiles: "M README.md" });
    expect(result.changedAuditedFiles).toEqual([]);
    expect(result.gate.pass).toBe(true);
  });

  it("explains how to get the file list when nothing is pasted", async () => {
    const { deps, auditId } = await importedAudit();
    await expect(
      checkChange(deps, "10000", { auditId, changedFiles: "  \n# nothing\n" }),
    ).rejects.toThrow(/git diff --name-status 3f1c2a9 HEAD/);
  });
});
