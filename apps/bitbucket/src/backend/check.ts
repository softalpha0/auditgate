import { compareSeverity } from "@auditgate/core";
import { computeDrift, fromBitbucketDiffstat, type BitbucketDiffstatEntry } from "@auditgate/drift";
import { evaluateGate } from "@auditgate/gate";
import { verifyProperty, type IssueProperty } from "@auditgate/jira";

/**
 * The AuditGate merge check. Reads the repository's findings from Jira, checks they were signed by
 * the AuditGate Jira app, compares the pull request with the audited commit and runs the same
 * gate as "Check a change" in Jira.
 *
 * It fails closed: if it can't reach Jira, can't verify the data or can't read the diff, the
 * check fails with a message that says what to fix. A gate that opens on errors isn't a gate.
 */

/** What a repository admin saves on the AuditGate settings page. Kept in encrypted storage. */
export interface JiraConfig {
  cloudId: string;
  email: string;
  token: string;
  signingSecret: string;
}

export interface FindingIssue {
  key: string;
  /** The issue's "auditgate" property as Jira returned it. Untrusted until verified. */
  property: unknown;
}

export interface Bitbucket {
  /** "workspace/slug" of the repository. */
  repoFullName(workspaceUuid: string, repoUuid: string): Promise<string>;
  /** Commit hash at the tip of the pull request's source branch. */
  sourceCommit(workspaceUuid: string, repoUuid: string, prId: number): Promise<string>;
  /** Files changed between two commits. Throws NotFound when a commit isn't in the repo. */
  diffstat(
    workspaceUuid: string,
    repoUuid: string,
    from: string,
    to: string,
  ): Promise<BitbucketDiffstatEntry[]>;
}

export interface Jira {
  findingsForRepo(config: JiraConfig, repo: string): Promise<FindingIssue[]>;
}

export interface CheckDeps {
  config(repoUuid: string): Promise<JiraConfig | undefined>;
  bitbucket: Bitbucket;
  jira: Jira;
}

export interface MergeCheckEvent {
  workspace: { uuid: string };
  repository: { uuid: string };
  pullrequest: { id: number };
  trigger?: { type?: string };
}

export interface MergeCheckResult {
  success: boolean;
  message: string;
}

/** Thrown by a port when Bitbucket or Jira answers 404. */
export class NotFound extends Error {
  override readonly name = "NotFound";
}

/** Thrown by a port with a message that's safe and useful to show on the pull request. */
export class CheckError extends Error {
  override readonly name = "CheckError";
}

const SETTINGS_HINT = "A repository admin can fix this in Repository settings > AuditGate.";

function isProperty(value: unknown): value is IssueProperty {
  const p = value as Partial<IssueProperty> | null;
  return (
    !!p &&
    typeof p === "object" &&
    typeof p.externalId === "string" &&
    typeof p.audit === "object" &&
    p.audit !== null &&
    typeof p.audit.id === "string"
  );
}

export function unwrapUuid(uuid: string): string {
  return uuid.replace(/^\{|\}$/g, "");
}

function list(items: string[], max = 6): string {
  return items.length > max
    ? `${items.slice(0, max).join(", ")} and ${items.length - max} more`
    : items.join(", ");
}

export async function runMergeCheck(
  deps: CheckDeps,
  event: MergeCheckEvent,
): Promise<MergeCheckResult> {
  const ws = event.workspace.uuid;
  const repoUuid = event.repository.uuid;

  const config = await deps.config(unwrapUuid(repoUuid));
  if (!config) {
    return {
      success: false,
      message: `AuditGate isn't connected to Jira for this repository yet. ${SETTINGS_HINT}`,
    };
  }

  const repo = (await deps.bitbucket.repoFullName(ws, repoUuid)).toLowerCase();
  const issues = await deps.jira.findingsForRepo(config, repo);
  if (issues.length === 0) {
    return {
      success: true,
      message: `AuditGate: no audit in Jira covers ${repo}, so there is nothing to check.`,
    };
  }

  // Anyone who can edit a Jira issue can edit its properties. Only signed data counts, and one
  // bad signature fails the check: dropping a Critical's signature mustn't hide the Critical.
  const unverified = issues.filter(
    (i) => !isProperty(i.property) || !verifyProperty(i.property, config.signingSecret),
  );
  if (unverified.length) {
    return {
      success: false,
      message: `AuditGate can't verify the audit data on ${list(unverified.map((i) => i.key))} in Jira. In Jira, open AuditGate > Connect Bitbucket and click Sign issues. If that doesn't fix it, the signing secret saved here doesn't match Jira's. ${SETTINGS_HINT}`,
    };
  }

  // A repo can have several audits (v1, v2...). The newest one is the one that counts.
  const verified = issues.map((i) => ({ key: i.key, p: i.property as IssueProperty }));
  const newest = verified.reduce((a, b) => (b.p.audit.createdAt > a.p.audit.createdAt ? b : a));
  const audit = newest.p.audit;
  const findings = verified
    .filter((f) => f.p.audit.id === audit.id)
    .sort(
      (a, b) =>
        compareSeverity(a.p.severity, b.p.severity) || a.p.externalId.localeCompare(b.p.externalId),
    );

  const head = await deps.bitbucket.sourceCommit(ws, repoUuid, event.pullrequest.id);
  let entries: BitbucketDiffstatEntry[];
  try {
    entries = await deps.bitbucket.diffstat(ws, repoUuid, audit.auditedCommit, head);
  } catch (error) {
    if (error instanceof NotFound) {
      return {
        success: false,
        message: `AuditGate: the audited commit ${audit.auditedCommit.slice(0, 7)} of "${audit.name}" isn't in this repository, so the change can't be compared with the audit. Check the commit on the audit in Jira.`,
      };
    }
    throw error;
  }

  const drift = computeDrift({
    auditedFiles: audit.auditedFiles,
    findings: findings.map((f) => ({
      id: f.p.findingId,
      externalId: f.p.externalId,
      file: f.p.file,
      extraLocations: f.p.files.filter((file) => file !== f.p.file).map((file) => ({ file })),
    })),
    changes: fromBitbucketDiffstat(entries),
  });
  const gate = evaluateGate(
    findings.map((f) => ({
      id: f.p.findingId,
      externalId: f.p.externalId,
      severity: f.p.severity,
      status: f.p.status,
    })),
    drift,
    { blockOnUnreviewedChanges: audit.blockOnUnreviewedChanges },
  );

  const keyOf = new Map(findings.map((f) => [f.p.externalId, f.key]));
  const parts = [gate.message];
  if (gate.blocking.length) {
    parts.push(`Jira: ${list(gate.blocking.map((id) => `${id} ${keyOf.get(id) ?? ""}`.trim()))}.`);
  }
  parts.push(`Compared with ${audit.auditedCommit.slice(0, 7)} ("${audit.name}").`);
  return { success: gate.pass, message: parts.join(" ") };
}
