import type { Finding } from "@auditgate/core";

/** A finding as read from a report, before it belongs to an audit or has a status. */
export type ImportedFinding = Omit<Finding, "auditId" | "status" | "jiraKey" | "history">;

export type ReportFormat = "slither" | "aderyn" | "markdown";

/** Header fields a Markdown report can carry. Tool output has none. */
export interface ReportMeta {
  name?: string;
  auditor?: string;
  commit?: string;
  scope?: string[];
}

export interface ParseResult {
  format: ReportFormat;
  findings: ImportedFinding[];
  /** Plain-language problems that didn't stop the import. Show them to the user. */
  warnings: string[];
  meta: ReportMeta;
}

export class ReportParseError extends Error {
  override readonly name = "ReportParseError";
}
