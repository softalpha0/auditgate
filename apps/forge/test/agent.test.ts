import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkDrift, getFinding, listOpenFindings, releaseReadiness } from "../src/backend/agent";
import { changeStatus, createAudit, runImport, type Caller } from "../src/backend/service";
import type { CreateAuditInput } from "../src/shared/contract";
import { makeDeps } from "./fakes";

const md = readFileSync(
  new URL("../../../demo/reports/vault-v2-audit.md", import.meta.url),
  "utf8",
);
const SHA = "3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e";
const vault: Caller = { projectId: "10000", projectKey: "VAULT", accountId: "user-1" };

function input(name = "Vault v2 audit"): CreateAuditInput {
  return {
    name,
    auditor: "Internal",
    workspace: "auditgate-demo",
    repoSlug: "vault-v2",
    auditedCommit: SHA,
    scope: [],
    report: { fileName: "r.md", data: md },
    blockOnUnreviewedChanges: true,
  };
}

async function setup() {
  const ctx = makeDeps();
  await createAudit(ctx.deps, vault, input());
  await runImport(ctx.deps, ctx.jobs.shift()!);
  return ctx;
}

describe("release-readiness", () => {
  it("says the release is blocked and names the blocking findings with Jira keys", async () => {
    const { deps } = await setup();
    const answer = await releaseReadiness(deps, { projectKey: "vault" });
    expect(answer.safeToShip).toBe(false);
    expect(answer.gateMessage).toBe("Blocked by AuditGate: 4 open (C-01, H-01, H-02, H-03).");
    expect(answer.blocking.map((b) => `${b.id}=${b.jiraKey}`)).toEqual([
      "C-01=VAULT-1",
      "H-01=VAULT-2",
      "H-02=VAULT-3",
      "H-03=VAULT-4",
    ]);
    expect(answer.audit).toMatchObject({
      name: "Vault v2 audit",
      project: "VAULT",
      auditedCommit: SHA,
    });
    expect(answer.findingsBySeverity).toEqual({ Critical: 1, High: 3, Medium: 3, Low: 3, Gas: 1 });
  });

  it("uses the project of the Jira page the user is on when no key is given", async () => {
    const { deps } = await setup();
    const answer = await releaseReadiness(deps, { context: { jira: { projectId: 10000 } } });
    expect(answer.audit.project).toBe("VAULT");
  });

  it("finds the user's only audit when no project is mentioned at all", async () => {
    const { deps } = await setup();
    expect((await releaseReadiness(deps, {})).audit.name).toBe("Vault v2 audit");
  });

  it("never answers about a project the user can't browse", async () => {
    const { deps, projects } = await setup();
    delete projects["10000"];
    delete projects.VAULT;
    await expect(releaseReadiness(deps, { projectKey: "VAULT" })).rejects.toThrow(
      /can't find a project "VAULT"/,
    );
    await expect(releaseReadiness(deps, {})).rejects.toThrow(
      /can't find any AuditGate audits you have access to/,
    );
  });

  it("picks the audit by name and lists the others", async () => {
    const { deps, jobs } = await setup();
    await createAudit(deps, vault, input("Vault v3 audit"));
    await runImport(deps, jobs.shift()!);
    expect((await releaseReadiness(deps, { projectKey: "VAULT" })).audit).toMatchObject({
      name: "Vault v3 audit",
      otherAuditsYouCanAskAbout: ["Vault v2 audit (VAULT)"],
    });
    expect((await releaseReadiness(deps, { projectKey: "VAULT", audit: "v2" })).audit.name).toBe(
      "Vault v2 audit",
    );
    await expect(releaseReadiness(deps, { projectKey: "VAULT", audit: "v9" })).rejects.toThrow(
      /No audit matches "v9"/,
    );
  });
});

describe("list-open-findings", () => {
  it("summarises open findings by severity, most severe first", async () => {
    const { deps } = await setup();
    const answer = await listOpenFindings(deps, { projectKey: "VAULT" });
    expect(answer.openCount).toBe(11);
    expect(answer.openBySeverity).toEqual({ Critical: 1, High: 3, Medium: 3, Low: 3, Gas: 1 });
    expect(answer.findings[0]).toMatchObject({ id: "C-01", jiraKey: "VAULT-1", status: "Open" });
    expect(answer.blocksRelease).toBe(true);
  });

  it("filters by severity and leaves out accepted risks", async () => {
    const { deps, jira } = await setup();
    const h02 = jira.issues.find((i) => i.property.externalId === "H-02")!;
    await changeStatus(deps, h02.id, "user-2", {
      to: "AcceptedRisk",
      note: "Owner is a multisig",
      approver: "user-1",
    });
    const answer = await listOpenFindings(deps, { projectKey: "VAULT", severity: "high" });
    expect(answer.findings.map((f) => f.id)).toEqual(["H-01", "H-03"]);
    await expect(listOpenFindings(deps, { severity: "urgent" })).rejects.toThrow(
      /isn't a severity/,
    );
  });
});

describe("get-finding", () => {
  it("answers who owns a finding, by audit ID or Jira key, with readable history", async () => {
    const { deps, jira } = await setup();
    jira.assignees["VAULT-4"] = "Ada Lovelace";
    const h03 = jira.issues.find((i) => i.property.externalId === "H-03")!;
    await changeStatus(deps, h03.id, "user-2", { to: "InFix", note: "PR #12" });

    const byId = await getFinding(deps, { projectKey: "VAULT", finding: "h-03" });
    expect(byId.finding).toMatchObject({
      id: "H-03",
      jiraKey: "VAULT-4",
      owner: "Ada Lovelace",
      status: "In fix",
      code: "TokenVault.emergencyWithdraw",
      lines: "69-72",
      blocksRelease: true,
      history: [{ who: "Grace Hopper", from: "Open", to: "In fix", note: "PR #12" }],
    });
    const byKey = await getFinding(deps, { projectKey: "VAULT", finding: "VAULT-1" });
    expect(byKey.finding).toMatchObject({ id: "C-01", owner: "Unassigned in Jira" });
  });

  it("explains what to ask for when the finding is missing or unknown", async () => {
    const { deps } = await setup();
    await expect(getFinding(deps, { projectKey: "VAULT" })).rejects.toThrow(/Say which finding/);
    await expect(getFinding(deps, { projectKey: "VAULT", finding: "H-99" })).rejects.toThrow(
      /Its findings are C-01, H-01, H-02, H-03, M-01/,
    );
  });
});

describe("check-drift", () => {
  it("asks for the changed files, with the exact git command, when none are given", async () => {
    const { deps } = await setup();
    const answer = await checkDrift(deps, { projectKey: "VAULT" });
    expect(answer).toMatchObject({ needsInput: true });
    expect("howToGetTheList" in answer && answer.howToGetTheList).toContain(
      `git diff --name-status ${SHA} HEAD`,
    );
  });

  it("reports drifted findings with Jira keys and the gate verdict", async () => {
    const { deps } = await setup();
    const answer = await checkDrift(deps, {
      projectKey: "VAULT",
      changedFiles: "M\tsrc/RewardsDistributor.sol\nM\tREADME.md",
    });
    expect(answer).toMatchObject({
      safeToMerge: false,
      comparedWithCommit: SHA,
      changedAuditedFiles: [
        {
          file: "src/RewardsDistributor.sol",
          change: "modified",
          affectedFindings: [
            "M-02 (VAULT-6, Medium, Open)",
            "M-03 (VAULT-7, Medium, Open)",
            "L-01 (VAULT-8, Low, Open)",
          ],
        },
      ],
      outOfScopeFiles: ["README.md"],
    });
  });
});
