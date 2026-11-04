import type { Severity } from "@auditgate/core";
import { ReportParseError, type ImportedFinding, type ParseResult } from "./types.js";
import { assignExternalIds, normalizePath, stableHash, truncate } from "./util.js";

// Field names checked against real `aderyn -o report.json` output (Aderyn 0.6.8).
interface AderynInstance {
  contract_path?: string;
  line_no?: number;
  hint?: string;
}

interface AderynIssue {
  title?: string;
  description?: string;
  detector_name?: string;
  instances?: AderynInstance[];
}

type AderynOutput = Record<string, unknown>;

/**
 * Aderyn 0.6 writes high_issues and low_issues. The other buckets are accepted in case a later
 * version adds them.
 */
const BUCKET_TO_SEVERITY: Record<string, Severity> = {
  critical_issues: "Critical",
  high_issues: "High",
  medium_issues: "Medium",
  low_issues: "Low",
};

function issuesIn(bucket: unknown): AderynIssue[] | undefined {
  const issues = (bucket as { issues?: unknown } | undefined)?.issues;
  return Array.isArray(issues) ? (issues as AderynIssue[]) : undefined;
}

export function parseAderyn(content: string | unknown): ParseResult {
  let data: AderynOutput;
  try {
    data = (typeof content === "string" ? JSON.parse(content) : content) as AderynOutput;
  } catch {
    throw new ReportParseError("This file isn't valid JSON, so it can't be Aderyn output.");
  }

  const buckets = Object.keys(BUCKET_TO_SEVERITY).filter((key) => issuesIn(data?.[key]));
  if (buckets.length === 0) {
    throw new ReportParseError(
      "No high_issues or low_issues found. Run Aderyn with -o report.json to produce this file.",
    );
  }

  const warnings: string[] = [];
  const findings: Omit<ImportedFinding, "externalId">[] = [];

  for (const bucket of buckets) {
    const severity = BUCKET_TO_SEVERITY[bucket] as Severity;
    for (const issue of issuesIn(data[bucket]) ?? []) {
      const detector = issue.detector_name ?? issue.title;
      if (!detector) {
        warnings.push(`Skipped an Aderyn issue in ${bucket} with no detector name or title.`);
        continue;
      }

      // One finding per (issue, file). A finding has one primary file, and drift works per file.
      const byFile = new Map<string, AderynInstance[]>();
      for (const instance of issue.instances ?? []) {
        if (!instance.contract_path) continue;
        const file = normalizePath(instance.contract_path);
        byFile.set(file, [...(byFile.get(file) ?? []), instance]);
      }
      if (byFile.size === 0) {
        warnings.push(`Skipped Aderyn issue "${detector}": it lists no file locations.`);
        continue;
      }

      for (const [file, instances] of byFile) {
        const lineNumbers = instances
          .map((i) => i.line_no)
          .filter((n): n is number => typeof n === "number")
          .sort((a, b) => a - b);
        const instanceList = instances
          .map((i) => `- ${file}${i.line_no ? `#L${i.line_no}` : ""}${i.hint ? `: ${i.hint}` : ""}`)
          .join("\n");

        const finding: Omit<ImportedFinding, "externalId"> = {
          id: stableHash("aderyn", detector, file),
          severity,
          title: truncate(issue.title ?? detector, 200),
          description: `${(issue.description ?? "").trim()}\n\nInstances:\n${instanceList}\n\nDetector: ${detector}.`,
          file,
          source: "aderyn",
        };
        const first = lineNumbers[0];
        const last = lineNumbers[lineNumbers.length - 1];
        if (first !== undefined && last !== undefined) finding.lines = [first, last];
        findings.push(finding);
      }
    }
  }

  return { format: "aderyn", findings: assignExternalIds(findings, "AD"), warnings, meta: {} };
}
