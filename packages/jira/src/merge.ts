import type { Finding } from "@auditgate/core";
import { stableHash, type ImportedFinding } from "@auditgate/parsers";

/** Fields that come from the report. Status, history and the Jira key belong to AuditGate. */
const CONTENT_KEYS = [
  "externalId",
  "severity",
  "title",
  "description",
  "recommendation",
  "file",
  "lines",
  "extraLocations",
  "contract",
  "fn",
  "source",
] as const;

/** A finding as AuditGate stores it: the finding plus what was last written to Jira. */
export interface StoredFinding extends Finding {
  /** contentHash() of the content last written to the Jira issue. */
  syncedHash?: string;
}

/** Hash of the report-owned content. When it changes, the Jira issue needs updating. */
export function contentHash(finding: Pick<Finding, (typeof CONTENT_KEYS)[number]>): string {
  return stableHash(...CONTENT_KEYS.map((key) => JSON.stringify(finding[key] ?? null)));
}

export function needsSync(finding: StoredFinding): boolean {
  return !finding.jiraKey || finding.syncedHash !== contentHash(finding);
}

export interface MergeResult {
  /** Every finding for the audit after the import, in report order, then findings the report dropped. */
  findings: StoredFinding[];
  /** External ids of findings that are new in this report. */
  added: string[];
  /** External ids whose report content changed. */
  changed: string[];
  /** External ids that are identical to the last import. */
  unchanged: string[];
  /** External ids that were imported before but are missing from this report. They are kept. */
  missing: string[];
}

/**
 * Merges a freshly parsed report into what's stored. Matching is by finding id, which the parsers
 * make stable, so re-importing never duplicates. Report content is replaced; status, history and
 * the Jira key are kept. Findings missing from the new report are kept untouched: an audit
 * finding disappearing from a report is something a person should look at, not something to
 * delete silently.
 */
export function mergeImport(
  existing: StoredFinding[],
  incoming: ImportedFinding[],
  auditId: string,
): MergeResult {
  const byId = new Map(existing.map((f) => [f.id, f]));
  const seen = new Set<string>();
  const result: MergeResult = { findings: [], added: [], changed: [], unchanged: [], missing: [] };

  for (const imported of incoming) {
    if (seen.has(imported.id)) continue;
    seen.add(imported.id);
    const previous = byId.get(imported.id);
    if (!previous) {
      result.findings.push({ ...imported, auditId, status: "Open", history: [] });
      result.added.push(imported.externalId);
      continue;
    }
    const merged: StoredFinding = {
      ...imported,
      auditId,
      status: previous.status,
      history: previous.history,
    };
    if (previous.jiraKey) merged.jiraKey = previous.jiraKey;
    if (previous.syncedHash) merged.syncedHash = previous.syncedHash;
    result.findings.push(merged);
    (contentHash(previous) === contentHash(merged) ? result.unchanged : result.changed).push(
      imported.externalId,
    );
  }

  for (const previous of existing) {
    if (!seen.has(previous.id)) {
      result.findings.push(previous);
      result.missing.push(previous.externalId);
    }
  }
  return result;
}
