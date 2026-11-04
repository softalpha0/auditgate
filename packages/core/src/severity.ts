import type { Severity } from "./types.js";

/** Lower number is more severe. Use for sorting. */
export const SEVERITY_RANK: Record<Severity, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Informational: 4,
  Gas: 5,
};

/** Letter used in finding IDs such as H-01. */
export const SEVERITY_PREFIX: Record<Severity, string> = {
  Critical: "C",
  High: "H",
  Medium: "M",
  Low: "L",
  Informational: "I",
  Gas: "G",
};

const PREFIX_TO_SEVERITY: Record<string, Severity> = Object.fromEntries(
  Object.entries(SEVERITY_PREFIX).map(([severity, prefix]) => [prefix, severity as Severity]),
);

/** "H-01" -> "High". Returns undefined for IDs that don't follow the letter-dash-number form. */
export function severityFromExternalId(externalId: string): Severity | undefined {
  const match = /^([CHMLIG])-\d+$/i.exec(externalId.trim());
  if (!match?.[1]) return undefined;
  return PREFIX_TO_SEVERITY[match[1].toUpperCase()];
}

/** Severities that can block a merge. */
export function isGatingSeverity(severity: Severity): boolean {
  return severity === "Critical" || severity === "High";
}

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}
