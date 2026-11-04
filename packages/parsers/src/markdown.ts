import { severityFromExternalId, type Location, type Severity } from "@auditgate/core";
import type { ImportedFinding, ParseResult, ReportMeta } from "./types.js";
import { ReportParseError } from "./types.js";
import { normalizePath, stableHash, truncate } from "./util.js";

// Format: demo/reports/TEMPLATE.md

const FINDING_HEADING = /^##\s+\[([^\]]+)\]\s*(.*?)\s*#*\s*$/;
const ANY_H2 = /^##\s+/;
const FIELD_HEADING = /^###\s+([^:]+?)\s*(?::\s*(.*?))?\s*$/;
const SHA = /^[0-9a-f]{7,40}$/i;

const SEVERITY_WORDS: Record<string, Severity> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  med: "Medium",
  low: "Low",
  informational: "Informational",
  info: "Informational",
  note: "Informational",
  gas: "Gas",
  optimization: "Gas",
  optimisation: "Gas",
};

function parseSeverity(text: string): Severity | undefined {
  const word = text.replace(/[*_`]/g, "").trim().toLowerCase().split(/[\s(]/)[0];
  return word ? SEVERITY_WORDS[word] : undefined;
}

/** "src/A.sol#L10-L20", "src/A.sol#L10", "src/A.sol:10-20" or "src/A.sol". */
export function parseLocation(text: string): Location | undefined {
  const cleaned = text.replace(/[`*]/g, "").trim();
  if (!cleaned) return undefined;
  const match = /^(.+?)(?:#L(\d+)(?:-L?(\d+))?|:(\d+)(?:-(\d+))?)?$/.exec(cleaned);
  if (!match?.[1]) return undefined;
  const start = Number(match[2] ?? match[4]);
  const end = Number(match[3] ?? match[5] ?? start);
  const location: Location = { file: normalizePath(match[1]) };
  if (Number.isInteger(start) && start > 0) {
    location.lines = [Math.min(start, end), Math.max(start, end)];
  }
  return location;
}

interface RawFinding {
  externalId: string;
  title: string;
  /** Text before the first ### heading. */
  preamble: string[];
  fields: { name: string; inline: string; body: string[] }[];
}

function parseHeader(lines: string[], warnings: string[]): ReportMeta {
  const meta: ReportMeta = {};
  let inScope = false;
  const scope: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!meta.name) {
      const title = /^#\s+(.+?)\s*#*$/.exec(line);
      if (title?.[1]) {
        meta.name = title[1];
        continue;
      }
    }
    const field = /^(auditor|commit|scope)\s*:\s*(.*)$/i.exec(line.replace(/[*_]{2}/g, "").trim());
    if (field?.[1]) {
      const name = field[1].toLowerCase();
      const value = (field[2] ?? "").replace(/`/g, "").trim();
      inScope = name === "scope";
      if (name === "auditor" && value) meta.auditor = value;
      if (name === "commit" && value) {
        if (SHA.test(value)) meta.commit = value.toLowerCase();
        else warnings.push(`The report's Commit line isn't a commit SHA ("${value}"). Ignored it.`);
      }
      if (name === "scope" && value) scope.push(...value.split(",").map((s) => s.trim()));
      continue;
    }
    if (inScope) {
      const item = /^[-*+]\s+(.+)$/.exec(line);
      if (item?.[1]) scope.push(item[1]);
      else if (line) inScope = false;
    }
  }

  const files = scope.map((s) => normalizePath(s.replace(/`/g, ""))).filter(Boolean);
  if (files.length) meta.scope = files;
  return meta;
}

function joinBody(lines: string[]): string {
  return lines.join("\n").trim();
}

export function parseMarkdownReport(content: string): ParseResult {
  if (typeof content !== "string" || !content.trim()) {
    throw new ReportParseError("The report is empty.");
  }
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const warnings: string[] = [];

  // Split into the header and one block per "## [ID] Title" heading. Any other "##" heading
  // (an appendix, say) ends the current finding.
  const header: string[] = [];
  const raws: RawFinding[] = [];
  let current: RawFinding | undefined;
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const findingMatch = inFence ? null : FINDING_HEADING.exec(line);
    if (findingMatch?.[1]) {
      current = {
        externalId: findingMatch[1].trim().toUpperCase(),
        title: (findingMatch[2] ?? "").trim(),
        preamble: [],
        fields: [],
      };
      raws.push(current);
      continue;
    }
    if (!inFence && ANY_H2.test(line)) {
      current = undefined;
      continue;
    }
    if (!current) {
      header.push(line);
      continue;
    }
    const fieldMatch = inFence ? null : FIELD_HEADING.exec(line);
    if (fieldMatch?.[1]) {
      current.fields.push({ name: fieldMatch[1].trim(), inline: fieldMatch[2] ?? "", body: [] });
      continue;
    }
    const lastField = current.fields[current.fields.length - 1];
    if (lastField) lastField.body.push(line);
    else current.preamble.push(line);
  }

  if (raws.length === 0) {
    throw new ReportParseError(
      'No findings found. Each finding needs a heading like "## [H-01] Title". See TEMPLATE.md.',
    );
  }

  const meta = parseHeader(header, warnings);
  const findings: ImportedFinding[] = [];
  const seenIds = new Set<string>();

  for (const raw of raws) {
    const label = `${raw.externalId}${raw.title ? ` (${truncate(raw.title, 60)})` : ""}`;
    if (seenIds.has(raw.externalId)) {
      warnings.push(`${raw.externalId} appears more than once. Kept the first, skipped this one.`);
      continue;
    }
    seenIds.add(raw.externalId);

    const field = (name: string) => raw.fields.find((f) => f.name.toLowerCase() === name);
    const fieldText = (name: string) => {
      const f = field(name);
      return f ? [f.inline, joinBody(f.body)].filter(Boolean).join("\n").trim() : "";
    };

    // Severity: the Severity line wins; the ID letter is the fallback.
    const fromId = severityFromExternalId(raw.externalId);
    const severityText = fieldText("severity");
    let severity = severityText ? parseSeverity(severityText) : undefined;
    if (severityText && !severity) {
      warnings.push(`${label}: didn't recognise severity "${severityText}".`);
    }
    if (!severity && fromId) {
      severity = fromId;
      warnings.push(`${label}: no usable Severity line, used ${fromId} from the ID.`);
    }
    if (!severity) {
      warnings.push(`${label}: no severity and the ID doesn't give one. Skipped this finding.`);
      continue;
    }
    if (fromId && fromId !== severity) {
      warnings.push(`${label}: the ID says ${fromId} but the Severity line says ${severity}.`);
    }

    // Locations: comma-separated, the first is primary.
    const locationText = fieldText("location") || fieldText("locations");
    const locations = locationText
      .split(/[,\n]/)
      .map((part) => parseLocation(part.replace(/^[-*+]\s+/, "")))
      .filter((l): l is Location => l !== undefined);
    const primary = locations[0];
    if (!primary) {
      warnings.push(
        `${label}: no Location, so AuditGate can't tell when its code changes. Imported anyway.`,
      );
    }

    // Description: text before the first field, the Description field, then any field we
    // don't know, kept under its own bold label so nothing is lost.
    const known = new Set([
      "severity",
      "location",
      "locations",
      "contract",
      "function",
      "description",
      "recommendation",
    ]);
    const descriptionParts = [joinBody(raw.preamble), fieldText("description")];
    for (const f of raw.fields) {
      if (!known.has(f.name.toLowerCase())) {
        descriptionParts.push(
          `**${f.name}**\n\n${[f.inline, joinBody(f.body)].filter(Boolean).join("\n")}`,
        );
      }
    }

    const finding: ImportedFinding = {
      id: stableHash("markdown", raw.externalId),
      externalId: raw.externalId,
      severity,
      title: truncate(raw.title || raw.externalId, 200),
      description: descriptionParts.filter(Boolean).join("\n\n"),
      file: primary?.file ?? "",
      source: "markdown",
    };
    if (primary?.lines) finding.lines = primary.lines;
    if (locations.length > 1) finding.extraLocations = locations.slice(1);
    const contract = fieldText("contract").replace(/`/g, "");
    if (contract) finding.contract = contract;
    const fn = fieldText("function").replace(/[`()]/g, "");
    if (fn) finding.fn = fn;
    const recommendation = fieldText("recommendation");
    if (recommendation) finding.recommendation = recommendation;
    findings.push(finding);
  }

  if (meta.scope) {
    const scope = new Set(meta.scope);
    for (const f of findings) {
      for (const loc of [f, ...(f.extraLocations ?? [])]) {
        if (loc.file && !scope.has(loc.file)) {
          warnings.push(`${f.externalId}: ${loc.file} isn't in the report's scope list.`);
        }
      }
    }
  }

  return { format: "markdown", findings, warnings, meta };
}
