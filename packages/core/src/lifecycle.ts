import type { Finding, FindingStatus, HistoryEntry } from "./types.js";

/**
 * Allowed status changes. This table is the source of truth for the finding lifecycle:
 *
 *   Open -> InFix -> FixedPendingRecheck -> Verified
 *   any non-Verified state -> Drifted   (audited file changed after the audit commit)
 *   Verified -> Drifted                 (file changed again after verification)
 *   Drifted -> InFix                    (someone picks it up)
 *   Open / Drifted -> AcceptedRisk      (needs a reason and an approver)
 *
 * "Any non-Verified state" includes AcceptedRisk: a risk was accepted for the code the auditor
 * saw, so a change to that code needs a fresh look.
 */
export const TRANSITIONS: Record<FindingStatus, readonly FindingStatus[]> = {
  Open: ["InFix", "Drifted", "AcceptedRisk"],
  InFix: ["FixedPendingRecheck", "Drifted"],
  FixedPendingRecheck: ["Verified", "Drifted"],
  Verified: ["Drifted"],
  Drifted: ["InFix", "AcceptedRisk"],
  AcceptedRisk: ["Drifted"],
};

export function canTransition(from: FindingStatus, to: FindingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface TransitionInput {
  to: FindingStatus;
  by: string;
  at: string;
  note?: string;
  /** Required when moving to AcceptedRisk. Account ID of the person who approved the risk. */
  approver?: string;
}

export class TransitionError extends Error {
  override readonly name = "TransitionError";
}

/**
 * Returns a new Finding with the status changed and a history entry appended.
 * Throws TransitionError if the change isn't allowed. Never mutates the input.
 */
export function transition(finding: Finding, input: TransitionInput): Finding {
  const from = finding.status;
  const { to } = input;

  if (!canTransition(from, to)) {
    throw new TransitionError(`${finding.externalId}: can't move from ${from} to ${to}`);
  }

  if (to === "AcceptedRisk") {
    if (!input.note?.trim()) {
      throw new TransitionError(`${finding.externalId}: accepting a risk needs a reason`);
    }
    if (!input.approver?.trim()) {
      throw new TransitionError(`${finding.externalId}: accepting a risk needs an approver`);
    }
  }

  const note =
    to === "AcceptedRisk" ? `${input.note?.trim()} (approved by ${input.approver})` : input.note;

  const entry: HistoryEntry = { at: input.at, by: input.by, from, to };
  if (note !== undefined) entry.note = note;

  return { ...finding, status: to, history: [...finding.history, entry] };
}
