import React from "react";
import { Lozenge } from "@forge/react";
import type { FindingStatus, Severity } from "@auditgate/core";

type Appearance = "danger" | "warning" | "success" | "information" | "discovery" | "neutral";

export const STATUS_LABEL: Record<FindingStatus, string> = {
  Open: "Open",
  InFix: "In fix",
  FixedPendingRecheck: "Awaiting re-check",
  Verified: "Verified",
  Drifted: "Drifted",
  AcceptedRisk: "Accepted risk",
};

const STATUS_APPEARANCE: Record<FindingStatus, Appearance> = {
  Open: "danger",
  InFix: "information",
  FixedPendingRecheck: "discovery",
  Verified: "success",
  Drifted: "warning",
  AcceptedRisk: "neutral",
};

const SEVERITY_APPEARANCE: Record<Severity, Appearance> = {
  Critical: "danger",
  High: "danger",
  Medium: "warning",
  Low: "neutral",
  Informational: "information",
  Gas: "neutral",
};

export const StatusLozenge = ({ status }: { status: FindingStatus }) => (
  <Lozenge
    appearance={STATUS_APPEARANCE[status]}
    isBold={status === "Drifted" || status === "Open"}
  >
    {STATUS_LABEL[status]}
  </Lozenge>
);

export const SeverityLozenge = ({ severity }: { severity: Severity }) => (
  <Lozenge appearance={SEVERITY_APPEARANCE[severity]} isBold={severity === "Critical"}>
    {severity}
  </Lozenge>
);

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Markdown from audit reports, as plain text for components that can't render Markdown. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
