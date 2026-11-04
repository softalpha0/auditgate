import type { Severity } from "@auditgate/core";
import { ReportParseError, type ImportedFinding, type ParseResult } from "./types.js";
import {
  assignExternalIds,
  normalizePath,
  stableHash,
  stripLocationRefs,
  truncate,
} from "./util.js";

// Field names checked against real `slither --json` output (Slither 0.11.6).
interface SlitherSourceMapping {
  filename_relative?: string;
  lines?: number[];
  is_dependency?: boolean;
}

interface SlitherElement {
  type?: string;
  name?: string;
  source_mapping?: SlitherSourceMapping;
  type_specific_fields?: { parent?: SlitherElement };
}

interface SlitherDetectorResult {
  check?: string;
  impact?: string;
  confidence?: string;
  description?: string;
  reference?: string;
  elements?: SlitherElement[];
}

interface SlitherOutput {
  success?: boolean;
  error?: string | null;
  results?: { detectors?: SlitherDetectorResult[] };
}

const IMPACT_TO_SEVERITY: Record<string, Severity> = {
  High: "High",
  Medium: "Medium",
  Low: "Low",
  Informational: "Informational",
  Optimization: "Gas",
};

function lineRange(mapping: SlitherSourceMapping | undefined): [number, number] | undefined {
  const lines = mapping?.lines;
  if (!lines?.length) return undefined;
  return [Math.min(...lines), Math.max(...lines)];
}

/** Walks up the parent chain to find the enclosing contract and function names. */
function enclosing(element: SlitherElement): { contract?: string; fn?: string } {
  const out: { contract?: string; fn?: string } = {};
  let current: SlitherElement | undefined = element;
  while (current) {
    if (current.type === "function" && !out.fn && current.name) out.fn = current.name;
    if (current.type === "contract" && !out.contract && current.name) out.contract = current.name;
    current = current.type_specific_fields?.parent;
  }
  return out;
}

export function parseSlither(content: string | unknown): ParseResult {
  let data: SlitherOutput;
  try {
    data = (typeof content === "string" ? JSON.parse(content) : content) as SlitherOutput;
  } catch {
    throw new ReportParseError("This file isn't valid JSON, so it can't be Slither output.");
  }
  if (data?.success === false) {
    throw new ReportParseError(`Slither reported a failed run: ${data.error ?? "no reason given"}`);
  }
  const detectors = data?.results?.detectors;
  if (!Array.isArray(detectors)) {
    throw new ReportParseError(
      "No results.detectors list found. Run Slither with --json to produce this file.",
    );
  }

  const warnings: string[] = [];
  const findings: Omit<ImportedFinding, "externalId">[] = [];
  const seen = new Set<string>();
  let skippedDependencies = 0;

  for (const [index, result] of detectors.entries()) {
    const primary = result.elements?.[0];
    const file = primary?.source_mapping?.filename_relative;
    if (!result.check || !file) {
      warnings.push(`Skipped Slither result #${index + 1}: it has no detector name or no file.`);
      continue;
    }
    if (primary.source_mapping?.is_dependency) {
      skippedDependencies++;
      continue;
    }

    const severity = IMPACT_TO_SEVERITY[result.impact ?? ""];
    if (!severity) {
      warnings.push(
        `Skipped Slither result #${index + 1} (${result.check}): unknown impact "${result.impact}".`,
      );
      continue;
    }

    // The detector plus every element's position. Two results from the same detector in the
    // same function (two unchecked transfers, say) differ in their node elements.
    const key = [
      result.check,
      ...(result.elements ?? []).map(
        (e) =>
          `${e.type}:${e.name}:${normalizePath(e.source_mapping?.filename_relative ?? "")}:${lineRange(e.source_mapping)?.[0] ?? ""}`,
      ),
    ];
    const id = stableHash("slither", ...key);
    if (seen.has(id)) continue;
    seen.add(id);

    const rawDescription = (result.description ?? "").trim();
    const firstLine = rawDescription.split("\n")[0] ?? result.check;
    const title = truncate(stripLocationRefs(firstLine).replace(/:$/, ""), 200);

    const finding: Omit<ImportedFinding, "externalId"> = {
      id,
      severity,
      title: title || result.check,
      description: `${rawDescription}\n\nDetector: ${result.check}. Slither confidence: ${result.confidence ?? "unknown"}.`,
      file: normalizePath(file),
      source: "slither",
    };
    const lines = lineRange(primary.source_mapping);
    if (lines) finding.lines = lines;
    const { contract, fn } = enclosing(primary);
    if (contract) finding.contract = contract;
    if (fn) finding.fn = fn;
    if (result.reference) finding.recommendation = `See ${result.reference}`;
    findings.push(finding);
  }

  if (skippedDependencies > 0) {
    warnings.push(
      `Skipped ${skippedDependencies} Slither result(s) in dependencies (for example lib/ or node_modules/).`,
    );
  }

  return { format: "slither", findings: assignExternalIds(findings, "SL"), warnings, meta: {} };
}
