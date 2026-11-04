import { SEVERITY_PREFIX, compareSeverity } from "@auditgate/core";
import type { ImportedFinding } from "./types.js";

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * FNV-1a, 64-bit, as 16 hex characters. Not cryptographic: it only has to give the same id
 * for the same input on every run, in Node and in the browser, with no dependencies.
 */
export function stableHash(...parts: string[]): string {
  let hash = FNV_OFFSET;
  const bytes = new TextEncoder().encode(parts.join("\u0000"));
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Repo-relative path with forward slashes and no leading "./" or "/". */
export function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "");
}

/** Strip Slither-style "(src/File.sol#10-20)" references and squash whitespace. */
export function stripLocationRefs(text: string): string {
  return text
    .replace(/\s*\([^()\s]+#\d+(?:-\d+)?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Gives tool findings readable ids such as "SL-H-01": tool prefix, severity letter, then a
 * number. Ordering is by severity, file, first line and id, so the same report always gets
 * the same numbers.
 */
export function assignExternalIds<T extends Omit<ImportedFinding, "externalId">>(
  findings: T[],
  toolPrefix: string,
): (T & { externalId: string })[] {
  const sorted = [...findings].sort(
    (a, b) =>
      compareSeverity(a.severity, b.severity) ||
      a.file.localeCompare(b.file) ||
      (a.lines?.[0] ?? 0) - (b.lines?.[0] ?? 0) ||
      a.id.localeCompare(b.id),
  );
  const counters = new Map<string, number>();
  return sorted.map((finding) => {
    const letter = SEVERITY_PREFIX[finding.severity];
    const n = (counters.get(letter) ?? 0) + 1;
    counters.set(letter, n);
    return { ...finding, externalId: `${toolPrefix}-${letter}-${String(n).padStart(2, "0")}` };
  });
}
