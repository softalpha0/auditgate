import { readFileSync } from "node:fs";
import type { Finding, FindingStatus } from "@auditgate/core";
import { issueProperty, signProperty } from "@auditgate/jira";
import { parseReport, toNewFindings } from "@auditgate/parsers";
import { describe, expect, it } from "vitest";
import {
  NotFound,
  runMergeCheck,
  type CheckDeps,
  type FindingIssue,
  type JiraConfig,
  type MergeCheckEvent,
} from "../src/backend/check";

const md = readFileSync(
  new URL("../../../demo/reports/vault-v2-audit.md", import.meta.url),
  "utf8",
);
const SHA = "3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e";
const HEAD = "a1b2c3d4e5f6";
const SECRET = "ab".repeat(32);
const config: JiraConfig = { cloudId: "c", email: "e@x.io", token: "t", signingSecret: SECRET };
const event: MergeCheckEvent = {
  workspace: { uuid: "{ws}" },
  repository: { uuid: "{repo-uuid}" },
  pullrequest: { id: 7 },
  trigger: { type: "on-code-pushed" },
};

function auditIssues(
  statuses: Partial<Record<string, FindingStatus>> = {},
  audit: { id?: string; name?: string; createdAt?: string } = {},
): FindingIssue[] {
  const id = audit.id ?? "a1";
  const findings = toNewFindings(parseReport(md).findings, id);
  const ordered = [...findings].sort((a, b) => a.externalId.localeCompare(b.externalId));
  return ordered.map((f: Finding, n) => ({
    key: `KAN-${n + 1}`,
    property: signProperty(
      issueProperty(
        { ...f, status: statuses[f.externalId] ?? "Open" },
        {
          id,
          name: audit.name ?? "Vault v2 audit",
          repo: { workspace: "AuditGate-Demo", slug: "vault-v2" },
          auditedCommit: SHA,
          auditedFiles: ["src/PriceOracle.sol", "src/RewardsDistributor.sol", "src/TokenVault.sol"],
          createdAt: audit.createdAt ?? "2026-11-02T09:00:00.000Z",
          settings: { blockOnUnreviewedChanges: true },
        },
      ),
      SECRET,
    ),
  }));
}

const keyOf = (issues: FindingIssue[], externalId: string) =>
  issues.find((i) => (i.property as { externalId: string }).externalId === externalId)!.key;

function deps(
  issues: FindingIssue[],
  changed: string[] = ["README.md"],
  overrides: Partial<CheckDeps> = {},
) {
  const calls = { diffstat: [] as string[][], repo: [] as string[] };
  const d: CheckDeps = {
    config: async (uuid) => (uuid === "repo-uuid" ? config : undefined),
    bitbucket: {
      repoFullName: async () => "auditgate-demo/vault-v2",
      sourceCommit: async () => HEAD,
      diffstat: async (_ws, _repo, from, to) => {
        calls.diffstat.push([from, to]);
        return changed.map((path) => ({ status: "modified", old: { path }, new: { path } }));
      },
    },
    jira: {
      findingsForRepo: async (_config, repo) => {
        calls.repo.push(repo);
        return issues;
      },
    },
    ...overrides,
  };
  return { d, calls };
}

const fixed = {
  "C-01": "Verified",
  "H-01": "Verified",
  "H-02": "AcceptedRisk",
  "H-03": "Verified",
} as const;

describe("merge check", () => {
  it("blocks while Critical and High findings are open, and names their Jira issues", async () => {
    const issues = auditIssues();
    const { d, calls } = deps(issues);
    const result = await runMergeCheck(d, event);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Blocked by AuditGate: 4 open (C-01, H-01, H-02, H-03).");
    expect(result.message).toContain(`C-01 ${keyOf(issues, "C-01")}`);
    expect(result.message).toContain('Compared with 3f1c2a9 ("Vault v2 audit").');
    expect(calls.repo).toEqual(["auditgate-demo/vault-v2"]);
    expect(calls.diffstat).toEqual([[SHA, HEAD]]);
  });

  it("passes when serious findings are fixed and no audited file changed", async () => {
    const { d } = deps(auditIssues(fixed), ["README.md", "docs/intro.md"]);
    const result = await runMergeCheck(d, event);
    expect(result).toEqual({
      success: true,
      message:
        'AuditGate: no open Critical or High findings. Accepted risk: H-02. Compared with 3f1c2a9 ("Vault v2 audit").',
    });
  });

  it("blocks a change to audited code nobody re-reviewed, even with every finding fixed", async () => {
    const { d } = deps(auditIssues(fixed), ["src/TokenVault.sol"]);
    const result = await runMergeCheck(d, event);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/drifted \(H-01, H-02, H-03\)/);
    expect(result.message).toMatch(
      /1 audited file changed without re-review \(src\/TokenVault\.sol\)/,
    );
  });

  it("fails when someone edits the AuditGate data on an issue to open the gate", async () => {
    const issues = auditIssues();
    const c01 = issues.find((i) => (i.property as { externalId: string }).externalId === "C-01")!;
    c01.property = { ...(c01.property as object), status: "Verified" };
    const result = await runMergeCheck(deps(issues).d, event);
    expect(result.success).toBe(false);
    expect(result.message).toContain(`can't verify the audit data on ${c01.key}`);
  });

  it("fails when the data was signed with another secret, or not at all", async () => {
    const unsigned = auditIssues().map((i) => ({
      ...i,
      property: { ...(i.property as object), sig: undefined },
    }));
    expect((await runMergeCheck(deps(unsigned).d, event)).success).toBe(false);
    const other = { ...config, signingSecret: "cd".repeat(32) };
    const { d } = deps(auditIssues(), [], { config: async () => other });
    expect((await runMergeCheck(d, event)).message).toMatch(/Sign issues/);
  });

  it("fails, with the fix, when the repository isn't connected to Jira", async () => {
    const { d } = deps([], [], { config: async () => undefined });
    expect(await runMergeCheck(d, event)).toEqual({
      success: false,
      message:
        "AuditGate isn't connected to Jira for this repository yet. A repository admin can fix this in Repository settings > AuditGate.",
    });
  });

  it("passes when no audit covers the repository", async () => {
    const result = await runMergeCheck(deps([]).d, event);
    expect(result).toMatchObject({ success: true });
    expect(result.message).toMatch(/no audit in Jira covers auditgate-demo\/vault-v2/);
  });

  it("says so when the audited commit isn't in the repository", async () => {
    const { d } = deps(auditIssues(), [], {});
    d.bitbucket.diffstat = async () => {
      throw new NotFound("no such commit");
    };
    const result = await runMergeCheck(d, event);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(
      /audited commit 3f1c2a9 of "Vault v2 audit" isn't in this repository/,
    );
  });

  it("uses the newest audit when a repository has several", async () => {
    const v1 = auditIssues(
      {},
      { id: "old", name: "Vault v1 audit", createdAt: "2026-01-01T00:00:00Z" },
    );
    const v2 = auditIssues(fixed, { id: "new", name: "Vault v2 audit" });
    const result = await runMergeCheck(deps([...v1, ...v2]).d, event);
    expect(result.success).toBe(true);
    expect(result.message).toContain('"Vault v2 audit"');
  });
});
