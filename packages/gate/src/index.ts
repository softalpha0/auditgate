import {
  compareSeverity,
  isGatingSeverity,
  type Finding,
  type FindingStatus,
} from "@auditgate/core";
import type { DriftReport } from "@auditgate/drift";

export type GateFinding = Pick<Finding, "id" | "externalId" | "severity" | "status">;

export interface GateOptions {
  /** Link appended to the message, normally the audit dashboard. */
  dashboardUrl?: string;
  /**
   * Also block when any audited file changed since the baseline, even if no Critical or High
   * finding is affected. Cleared by a re-review sign-off at the commit being checked.
   */
  blockOnUnreviewedChanges?: boolean;
  /** True when someone signed off a re-review at exactly the commit being checked. */
  changesReviewed?: boolean;
  /** How many keys to list per group before "+N more". */
  maxKeysPerGroup?: number;
}

export interface GateResult {
  pass: boolean;
  message: string;
  /** External ids of the Critical/High findings that block, most severe first. */
  blocking: string[];
  /** External ids of Critical/High findings passed as accepted risk. */
  accepted: string[];
  /** Audited files that changed and block on their own (only with blockOnUnreviewedChanges). */
  unreviewedFiles: string[];
}

const BLOCKING_STATUSES: readonly FindingStatus[] = [
  "Open",
  "InFix",
  "FixedPendingRecheck",
  "Drifted",
];

const GROUP_LABELS: [FindingStatus, string][] = [
  ["Open", "open"],
  ["InFix", "in fix"],
  ["FixedPendingRecheck", "awaiting re-check"],
  ["Drifted", "drifted"],
];

/**
 * The status the gate should act on. A Verified or Accepted finding whose code changed is
 * Drifted for the gate even before the stored status catches up, so a stale store can never
 * let changed code through. Open, In fix and Pending re-check findings already block, and keep
 * their own status so the message tells people what to do next.
 */
export function effectiveStatus(finding: GateFinding, drifted: ReadonlySet<string>): FindingStatus {
  if (
    drifted.has(finding.id) &&
    (finding.status === "Verified" || finding.status === "AcceptedRisk")
  ) {
    return "Drifted";
  }
  return finding.status;
}

function list(keys: string[], max: number): string {
  if (keys.length <= max) return keys.join(", ");
  return `${keys.slice(0, max).join(", ")} +${keys.length - max} more`;
}

/**
 * Gate rule: fail while any Critical or High finding is Open, In fix, Fixed (pending re-check)
 * or Drifted. Accepted risk passes and is named in the message. Lower severities never block.
 */
export function evaluateGate(
  findings: GateFinding[],
  drift?: DriftReport,
  options: GateOptions = {},
): GateResult {
  const max = options.maxKeysPerGroup ?? 8;
  const drifted = new Set(drift?.driftedFindings.map((d) => d.id) ?? []);
  const gating = findings
    .filter((f) => isGatingSeverity(f.severity))
    .sort(
      (a, b) => compareSeverity(a.severity, b.severity) || a.externalId.localeCompare(b.externalId),
    );

  const groups = new Map<FindingStatus, string[]>();
  const accepted: string[] = [];
  for (const finding of gating) {
    const status = effectiveStatus(finding, drifted);
    if (BLOCKING_STATUSES.includes(status)) {
      groups.set(status, [...(groups.get(status) ?? []), finding.externalId]);
    } else if (status === "AcceptedRisk") {
      accepted.push(finding.externalId);
    }
  }
  const blocking = gating
    .map((f) => f.externalId)
    .filter((id) => [...groups.values()].some((ids) => ids.includes(id)));

  const unreviewedFiles =
    options.blockOnUnreviewedChanges && !options.changesReviewed
      ? (drift?.changedFiles.map((f) => f.path) ?? [])
      : [];

  const pass = blocking.length === 0 && unreviewedFiles.length === 0;
  const parts: string[] = [];

  if (pass) {
    parts.push("AuditGate: no open Critical or High findings.");
  } else {
    const summary = GROUP_LABELS.filter(([status]) => groups.has(status)).map(([status, label]) => {
      const ids = groups.get(status) ?? [];
      return `${ids.length} ${label} (${list(ids, max)})`;
    });
    if (unreviewedFiles.length) {
      const n = unreviewedFiles.length;
      summary.push(
        `${n} audited file${n === 1 ? "" : "s"} changed without re-review (${list(unreviewedFiles, max)})`,
      );
    }
    parts.push(`Blocked by AuditGate: ${summary.join(", ")}.`);
  }
  if (accepted.length) parts.push(`Accepted risk: ${list(accepted, max)}.`);
  if (options.dashboardUrl) parts.push(`See ${options.dashboardUrl}`);

  return { pass, message: parts.join(" "), blocking, accepted, unreviewedFiles };
}
