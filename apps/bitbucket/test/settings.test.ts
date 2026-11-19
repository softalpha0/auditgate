import { readFileSync } from "node:fs";
import { issueProperty, signProperty } from "@auditgate/jira";
import { parseReport, toNewFindings } from "@auditgate/parsers";
import { describe, expect, it } from "vitest";
import { CheckError, type FindingIssue, type JiraConfig } from "../src/backend/check";
import {
  getSettings,
  repoFromLocation,
  resolveWhere,
  saveSettings,
  type SettingsDeps,
} from "../src/backend/settings";

const md = readFileSync(
  new URL("../../../demo/reports/vault-v2-audit.md", import.meta.url),
  "utf8",
);
const SECRET = "ab".repeat(32);
const CLOUD = "9b0cbf4e-290f-4451-a764-48f8ce6d207f";
const where = { repoUuid: "r1", repo: "auditgate-demo/vault-v2" };
const input = { cloudId: CLOUD, email: "me@example.com", token: "tok", signingSecret: SECRET };

const issues: FindingIssue[] = toNewFindings(parseReport(md).findings, "a1").map((f, n) => ({
  key: `KAN-${n + 1}`,
  property: signProperty(
    issueProperty(f, {
      id: "a1",
      name: "Vault v2 audit",
      repo: { workspace: "auditgate-demo", slug: "vault-v2" },
      auditedCommit: "3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e",
      auditedFiles: [],
      createdAt: "2026-11-02T09:00:00Z",
    }),
    SECRET,
  ),
}));

function fake(found: FindingIssue[] | Error = issues) {
  const saved = new Map<string, JiraConfig>();
  const d: SettingsDeps = {
    load: async (id) => saved.get(id),
    save: async (id, c) => void saved.set(id, c),
    remove: async (id) => void saved.delete(id),
    jira: {
      findingsForRepo: async () => {
        if (found instanceof Error) throw found;
        return found;
      },
    },
  };
  return { d, saved };
}

describe("settings page", () => {
  it("reads the repository from the settings page URL", () => {
    expect(
      repoFromLocation(
        "https://bitbucket.org/AuditGate-Demo/vault-v2/admin/forge/app/production/s",
      ),
    ).toBe("auditgate-demo/vault-v2");
    expect(repoFromLocation("not a url")).toBeUndefined();
  });

  it("finds the repository from the workspace and repository IDs Forge passes", async () => {
    // Seen on bitbucket.org: the resolver context has workspaceId and repository.uuid, no URL.
    const calls: string[][] = [];
    const bitbucket = {
      repoFullName: async (ws: string, repo: string) => {
        calls.push([ws, repo]);
        return "AuditGate-Demo/vault-v2";
      },
    };
    await expect(
      resolveWhere(
        { workspaceId: "{ws-1}", extension: { repository: { uuid: "{r-1}" } } },
        bitbucket,
      ),
    ).resolves.toEqual({ repoUuid: "r-1", repo: "auditgate-demo/vault-v2" });
    expect(calls).toEqual([["{ws-1}", "{r-1}"]]);
    await expect(resolveWhere({ workspaceId: "{ws-1}" }, bitbucket)).rejects.toThrow(
      /repository's settings/,
    );
    await expect(
      resolveWhere({ extension: { repository: { uuid: "{r-1}" } } }, bitbucket),
    ).rejects.toThrow(/which workspace/);
  });

  it("checks the values against Jira, then saves them", async () => {
    const { d, saved } = fake();
    expect(await saveSettings(d, where, input)).toEqual({
      findings: 11,
      audits: ["Vault v2 audit"],
    });
    expect(saved.get("r1")).toEqual(input);
    expect(await getSettings(d, where)).toEqual({
      repo: where.repo,
      connected: true,
      cloudId: CLOUD,
      email: "me@example.com",
    });
  });

  it("never sends the token or secret back to the page, and keeps them when left empty", async () => {
    const { d, saved } = fake();
    await saveSettings(d, where, input);
    expect(JSON.stringify(await getSettings(d, where))).not.toContain("tok");
    await saveSettings(d, where, {
      ...input,
      email: "new@example.com",
      token: "",
      signingSecret: "",
    });
    expect(saved.get("r1")).toEqual({ ...input, email: "new@example.com" });
  });

  it("lists every problem with the form at once and saves nothing", async () => {
    const { d, saved } = fake();
    await expect(
      saveSettings(d, where, { cloudId: "x", email: "nope", token: "", signingSecret: "short" }),
    ).rejects.toThrow(/site ID.*email.*API token.*signing secret/);
    expect(saved.size).toBe(0);
  });

  it("refuses a signing secret that doesn't match the data in Jira", async () => {
    const { d, saved } = fake();
    await expect(
      saveSettings(d, where, { ...input, signingSecret: "cd".repeat(32) }),
    ).rejects.toThrow(/none match this signing secret/);
    expect(saved.size).toBe(0);
  });

  it("passes on Jira's own error, such as a rejected token, and saves nothing", async () => {
    const { d, saved } = fake(
      new CheckError("Jira rejected the email and API token saved for AuditGate."),
    );
    await expect(saveSettings(d, where, input)).rejects.toThrow(
      /rejected the email.*Nothing was saved/,
    );
    expect(saved.size).toBe(0);
  });
});
