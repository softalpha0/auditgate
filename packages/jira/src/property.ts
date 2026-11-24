import { createHmac, timingSafeEqual } from "node:crypto";
import { SEVERITY_RANK, type Audit, type Finding, type Severity } from "@auditgate/core";

/** Issue property key written on every finding issue. Indexed for JQL by the manifest. */
export const ISSUE_PROPERTY_KEY = "auditgate";

/** Bumped when the shape of IssueProperty changes in a way readers must know about. */
export const ISSUE_PROPERTY_VERSION = 2;

/**
 * What the Bitbucket merge check needs to know about the audit. Copied onto every finding issue
 * because the Bitbucket app can only read Jira, not the Jira app's storage.
 */
export interface PropertyAudit {
  id: string;
  name: string;
  /** "workspace/repo-slug" on Bitbucket Cloud. */
  repo: string;
  auditedCommit: string;
  auditedFiles: string[];
  blockOnUnreviewedChanges: boolean;
  createdAt: string;
  /** Commits where someone signed off a re-review of every change since the audit. */
  reviewedCommits: string[];
}

/**
 * The AuditGate data on a Jira issue. Top-level fields are indexed for JQL. Anyone who can edit
 * the issue can also edit this property, so it carries an HMAC signature (`sig`) made with a
 * secret only the Jira app and the admin-configured Bitbucket app know.
 */
export interface IssueProperty {
  v: number;
  auditId: string;
  findingId: string;
  externalId: string;
  severity: Severity;
  /** Lower is more severe; lets JQL sort by severity. */
  severityRank: number;
  status: Finding["status"];
  file: string;
  /** Every file the finding points at, including extra locations. */
  files: string[];
  /** Same as audit.repo, kept top-level so JQL can find a repo's findings. */
  repo: string;
  audit: PropertyAudit;
  sig?: string;
}

/** The audit as the Jira app stores it. Only these fields go onto issues. */
export type PropertyAuditSource = Pick<
  Audit,
  "id" | "name" | "repo" | "auditedCommit" | "auditedFiles" | "createdAt"
> & {
  settings?: { blockOnUnreviewedChanges: boolean };
  reviews?: { commit: string }[];
};

/** Only the newest sign-offs travel on issues; older commits are long merged. */
const MAX_REVIEWED_COMMITS = 20;

/** Above this many audited files, only the files with findings are copied onto issues. */
const MAX_AUDITED_FILES = 300;

/** "workspace/slug", lowercase: the form both apps use to match a repo. */
export function repoKey(workspace: string, slug: string): string {
  return `${workspace.trim()}/${slug.trim()}`.toLowerCase();
}

export function issueProperty(finding: Finding, audit: PropertyAuditSource): IssueProperty {
  // Bitbucket workspace and repo slugs are lowercase; match however the form was filled in.
  const repo = repoKey(audit.repo.workspace, audit.repo.slug);
  const files = [
    ...new Set([finding.file, ...(finding.extraLocations ?? []).map((l) => l.file)]),
  ].filter(Boolean);
  return {
    v: ISSUE_PROPERTY_VERSION,
    auditId: finding.auditId,
    findingId: finding.id,
    externalId: finding.externalId,
    severity: finding.severity,
    severityRank: SEVERITY_RANK[finding.severity],
    status: finding.status,
    file: finding.file,
    files,
    repo,
    audit: {
      id: audit.id,
      name: audit.name,
      repo,
      auditedCommit: audit.auditedCommit,
      auditedFiles: audit.auditedFiles.slice(0, MAX_AUDITED_FILES),
      blockOnUnreviewedChanges: audit.settings?.blockOnUnreviewedChanges ?? true,
      createdAt: audit.createdAt,
      reviewedCommits: (audit.reviews ?? [])
        .slice(-MAX_REVIEWED_COMMITS)
        .map((r) => r.commit.toLowerCase()),
    },
  };
}

/** JSON with object keys sorted at every level, so both apps hash exactly the same bytes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function signatureOf(property: IssueProperty, secret: string): string {
  const unsigned: Partial<IssueProperty> = { ...property };
  delete unsigned.sig;
  return createHmac("sha256", secret).update(canonicalJson(unsigned)).digest("hex");
}

/**
 * True when one of the signed-off commits is the commit being checked. Bitbucket often reports
 * abbreviated hashes, so a prefix of at least 12 characters counts.
 */
export function isReviewedCommit(reviewed: readonly string[], commit: string): boolean {
  const c = commit.trim().toLowerCase();
  if (c.length < 12) return false;
  return reviewed.some((r) => r.startsWith(c) || (r.length >= 12 && c.startsWith(r)));
}

export function signProperty(property: IssueProperty, secret: string): IssueProperty {
  return { ...property, sig: signatureOf(property, secret) };
}

/** True only when the property was signed with this secret and not changed since. */
export function verifyProperty(property: IssueProperty, secret: string): boolean {
  if (typeof property.sig !== "string" || !/^[0-9a-f]{64}$/.test(property.sig)) return false;
  const expected = Buffer.from(signatureOf(property, secret), "hex");
  const actual = Buffer.from(property.sig, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
