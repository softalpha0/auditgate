export const SEVERITIES = ["Critical", "High", "Medium", "Low", "Informational", "Gas"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FINDING_STATUSES = [
  "Open",
  "InFix",
  "FixedPendingRecheck",
  "Verified",
  "Drifted",
  "AcceptedRisk",
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export type FindingSource = "slither" | "aderyn" | "markdown";

export interface RepoRef {
  workspace: string;
  slug: string;
}

export interface Location {
  /** Repo-relative path, forward slashes. */
  file: string;
  /** Inclusive line range. */
  lines?: [number, number];
}

export interface SignOff {
  by: string;
  at: string;
  commit: string;
}

export interface Audit {
  id: string;
  /** e.g. "Vault v2 audit" */
  name: string;
  /** "Internal" or the firm's name */
  auditor: string;
  repo: RepoRef;
  /** Full 40-character SHA the auditor reviewed. */
  auditedCommit: string;
  /** Repo-relative paths in scope. */
  auditedFiles: string[];
  createdAt: string;
  signOff?: SignOff;
}

export interface HistoryEntry {
  at: string;
  /** Atlassian account ID, or "auditgate" for automatic changes such as drift. */
  by: string;
  from: FindingStatus;
  to: FindingStatus;
  note?: string;
}

export interface Finding {
  /** Stable hash of source + check + location. Same input always gives the same id. */
  id: string;
  auditId: string;
  /** "H-01" for Markdown reports, a generated id for tool output. */
  externalId: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation?: string;
  /** Repo-relative path of the primary location. */
  file: string;
  /** Inclusive line range of the primary location. */
  lines?: [number, number];
  /** Further locations, when one finding covers code in more than one place. Drift checks all of them. */
  extraLocations?: Location[];
  contract?: string;
  fn?: string;
  source: FindingSource;
  status: FindingStatus;
  jiraKey?: string;
  history: HistoryEntry[];
}
