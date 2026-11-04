/**
 * The contract between the UI Kit frontends and the resolvers. Both sides import these types, so
 * a change here is checked on both. Import with `import type` only: nothing here may pull backend
 * code into a frontend bundle.
 */
import type { Audit, FindingStatus, HistoryEntry, Severity } from "@auditgate/core";
import type { ReportFormat, ReportMeta } from "@auditgate/parsers";

export type ImportState = "queued" | "running" | "done" | "failed";

export interface ImportStatus {
  state: ImportState;
  total: number;
  created: number;
  updated: number;
  failed: number;
  /** Plain-language lines for the user, newest last. */
  messages: string[];
  queuedAt: string;
  finishedAt?: string;
}

export interface AuditSettings {
  /** Block merges on any change to an audited file until it's re-reviewed. */
  blockOnUnreviewedChanges: boolean;
}

/** An audit as stored: the core Audit plus where it lives in Jira and its import state. */
export interface StoredAudit extends Audit {
  projectId: string;
  projectKey: string;
  createdBy: string;
  reportFormat: ReportFormat;
  settings: AuditSettings;
  import: ImportStatus;
  lastImport: ImportSummary;
}

export interface ImportSummary {
  added: string[];
  changed: string[];
  unchanged: string[];
  missing: string[];
  warnings: string[];
}

/** An uploaded report: file name plus the file picker's data string, or pasted text. */
export interface ReportUpload {
  fileName: string;
  data: string;
}

export interface ReportPreview {
  format: ReportFormat;
  total: number;
  bySeverity: Partial<Record<Severity, number>>;
  warnings: string[];
  meta: ReportMeta;
  /** Files the findings point at, for prefilling the scope field. */
  files: string[];
}

export interface CreateAuditInput {
  name: string;
  auditor: string;
  workspace: string;
  repoSlug: string;
  auditedCommit: string;
  /** One repo-relative path per entry. Empty means "use the report's scope". */
  scope: string[];
  report: ReportUpload;
  blockOnUnreviewedChanges: boolean;
}

export interface ReimportInput {
  auditId: string;
  report: ReportUpload;
}

export interface GateView {
  pass: boolean;
  message: string;
}

export interface AuditSummary {
  id: string;
  name: string;
  auditor: string;
  repo: string;
  auditedCommit: string;
  createdAt: string;
  total: number;
  bySeverity: Partial<Record<Severity, number>>;
  byStatus: Partial<Record<FindingStatus, number>>;
  gate: GateView;
  import: ImportStatus;
}

export interface FindingRow {
  id: string;
  externalId: string;
  severity: Severity;
  title: string;
  file: string;
  lines?: [number, number];
  status: FindingStatus;
  jiraKey?: string;
  sourceUrl?: string;
  lastChange?: string;
}

export interface AuditDetail {
  summary: AuditSummary;
  scope: string[];
  settings: AuditSettings;
  lastImport: ImportSummary;
  findings: FindingRow[];
}

export interface LocationLink {
  label: string;
  url: string;
}

export interface PanelView {
  finding: {
    externalId: string;
    severity: Severity;
    status: FindingStatus;
    title: string;
    contract?: string;
    fn?: string;
    recommendation?: string;
    source: string;
    locations: LocationLink[];
    history: HistoryEntry[];
  };
  audit: { id: string; name: string; auditor: string; auditedCommit: string; repo: string };
  /** Status changes a person can make from the panel. Drift and verification are automatic. */
  allowedTransitions: FindingStatus[];
}

export interface ChangeStatusInput {
  to: FindingStatus;
  note?: string;
  /** Account ID of the approver. Required for AcceptedRisk. */
  approver?: string;
}

export interface CheckChangeInput {
  auditId: string;
  /** Output of `git diff --name-status <audited-commit> HEAD`, or one path per line. */
  changedFiles: string;
}

export interface CheckedFile {
  path: string;
  status: "added" | "removed" | "modified" | "renamed";
  renamedTo?: string;
  /** External ids of findings located in this file. Empty for an audited file with no findings. */
  findings: string[];
}

export interface CheckChangeResult {
  /** The commit the change was compared against. */
  comparedTo: string;
  /** How many changed files were read from the input. */
  filesRead: number;
  gate: GateView & { blocking: string[]; accepted: string[]; unreviewedFiles: string[] };
  changedAuditedFiles: CheckedFile[];
  outOfScopeFiles: string[];
}

/** Every resolver returns either data or a plain-language error. Never throws to the UI. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Resolver keys, so the frontend can't call a name that doesn't exist. */
export const RESOLVERS = {
  previewReport: "previewReport",
  createAudit: "createAudit",
  reimport: "reimport",
  listAudits: "listAudits",
  getAudit: "getAudit",
  getPanel: "getPanel",
  changeStatus: "changeStatus",
  checkChange: "checkChange",
} as const;
