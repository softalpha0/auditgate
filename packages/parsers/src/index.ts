import type { Finding } from "@auditgate/core";
import { parseAderyn } from "./aderyn.js";
import { parseMarkdownReport } from "./markdown.js";
import { parseSlither } from "./slither.js";
import {
  ReportParseError,
  type ImportedFinding,
  type ParseResult,
  type ReportFormat,
} from "./types.js";

export * from "./types.js";
export { parseAderyn } from "./aderyn.js";
export { parseLocation, parseMarkdownReport } from "./markdown.js";
export { parseSlither } from "./slither.js";
export { MAX_REPORT_BYTES, decodeUpload } from "./upload.js";
export { normalizePath, stableHash } from "./util.js";

/** Works out which parser a file needs from its content. The file name is only a tiebreak. */
export function detectFormat(content: string, fileName = ""): ReportFormat | undefined {
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      if (data && typeof data === "object") {
        const results = data.results as { detectors?: unknown } | undefined;
        if ("results" in data && (results?.detectors !== undefined || "success" in data)) {
          return "slither";
        }
        if ("high_issues" in data || "low_issues" in data || "issue_count" in data) {
          return "aderyn";
        }
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
  if (/^##\s+\[[^\]]+\]/m.test(content) || /\.(md|markdown)$/i.test(fileName)) {
    return "markdown";
  }
  return undefined;
}

/** Detects the format and parses. Throws ReportParseError with a plain-language message. */
export function parseReport(content: string, fileName = ""): ParseResult {
  const format = detectFormat(content, fileName);
  switch (format) {
    case "slither":
      return parseSlither(content);
    case "aderyn":
      return parseAderyn(content);
    case "markdown":
      return parseMarkdownReport(content);
    default:
      throw new ReportParseError(
        "AuditGate can't read this file. Upload Slither JSON (--json), Aderyn JSON (-o file.json) or a Markdown report in the TEMPLATE.md format.",
      );
  }
}

/**
 * Attaches imported findings to an audit as new, Open findings. Ids stay as the parser made
 * them; storage keys them by audit id plus finding id, so two audits never collide.
 */
export function toNewFindings(imported: ImportedFinding[], auditId: string): Finding[] {
  return imported.map((f) => ({ ...f, auditId, status: "Open", history: [] }));
}
