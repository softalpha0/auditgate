import {
  SEVERITY_RANK,
  type Audit,
  type Finding,
  type Location,
  type Severity,
} from "@auditgate/core";
import {
  doc,
  heading,
  inline,
  markdownToBlocks,
  paragraph,
  text,
  type AdfBlock,
  type AdfDoc,
} from "./adf.js";

/** Issue property key written on every finding issue. Indexed for JQL by the manifest. */
export const ISSUE_PROPERTY_KEY = "auditgate";

export interface IssueProperty {
  auditId: string;
  findingId: string;
  externalId: string;
  severity: Severity;
  /** Lower is more severe; lets JQL sort by severity. */
  severityRank: number;
  status: Finding["status"];
  file: string;
}

const SOURCE_LABEL: Record<Finding["source"], string> = {
  slither: "Slither",
  aderyn: "Aderyn",
  markdown: "Markdown audit report",
};

/** Link to a file at a commit on Bitbucket Cloud, with the line range highlighted. */
export function bitbucketSourceUrl(
  audit: Pick<Audit, "repo" | "auditedCommit">,
  location: Location,
): string {
  const { workspace, slug } = audit.repo;
  const path = location.file.split("/").map(encodeURIComponent).join("/");
  const base = `https://bitbucket.org/${encodeURIComponent(workspace)}/${encodeURIComponent(slug)}/src/${audit.auditedCommit}/${path}`;
  if (!location.lines) return base;
  const [start, end] = location.lines;
  return `${base}#lines-${start}${end !== start ? `:${end}` : ""}`;
}

export function locationLabel(location: Location): string {
  if (!location.lines) return location.file;
  const [start, end] = location.lines;
  return `${location.file}#L${start}${end !== start ? `-L${end}` : ""}`;
}

/** Jira summaries are capped at 255 characters. */
export function issueSummary(finding: Pick<Finding, "externalId" | "title">): string {
  const summary = `[${finding.externalId}] ${finding.title}`.replace(/\s+/g, " ").trim();
  return summary.length <= 255 ? summary : `${summary.slice(0, 254)}…`;
}

/** Labels have no spaces in Jira. Lower-case so JQL is predictable. */
export function issueLabels(finding: Pick<Finding, "severity">, auditId: string): string[] {
  return ["auditgate", `sev-${finding.severity.toLowerCase()}`, `audit-${auditId}`];
}

const PRIORITY_NAMES: Record<Severity, string[]> = {
  Critical: ["highest", "critical", "blocker"],
  High: ["high", "major"],
  Medium: ["medium", "normal"],
  Low: ["low", "minor"],
  Informational: ["lowest", "trivial", "low"],
  Gas: ["lowest", "trivial", "low"],
};

/**
 * Picks the project's priority for a severity by name. Returns undefined when nothing matches,
 * in which case the issue is created with the project default rather than a wrong priority.
 */
export function pickPriorityId(
  severity: Severity,
  allowed: { id: string; name: string }[],
): string | undefined {
  for (const name of PRIORITY_NAMES[severity]) {
    const match = allowed.find((p) => p.name.trim().toLowerCase() === name);
    if (match) return match.id;
  }
  return undefined;
}

/** Prefers Bug, then Task, then any standard issue type. Never a subtask. */
export function pickIssueTypeId(
  types: { id: string; name: string; subtask?: boolean }[],
): string | undefined {
  const standard = types.filter((t) => !t.subtask);
  for (const name of ["bug", "task"]) {
    const match = standard.find((t) => t.name.trim().toLowerCase() === name);
    if (match) return match.id;
  }
  return standard[0]?.id;
}

export function issueDescription(
  finding: Finding,
  audit: Pick<Audit, "repo" | "auditedCommit" | "name">,
): AdfDoc {
  const locations: Location[] = [];
  if (finding.file) {
    const primary: Location = { file: finding.file };
    if (finding.lines) primary.lines = finding.lines;
    locations.push(primary, ...(finding.extraLocations ?? []));
  }

  const blocks: AdfBlock[] = [
    paragraph([
      text("Severity: ", [{ type: "strong" }]),
      text(finding.severity),
      text("   Source: ", [{ type: "strong" }]),
      text(SOURCE_LABEL[finding.source]),
      text("   Audit: ", [{ type: "strong" }]),
      text(audit.name),
    ]),
  ];

  if (locations.length) {
    blocks.push(
      paragraph([
        text(locations.length === 1 ? "Location: " : "Locations: ", [{ type: "strong" }]),
        ...locations.flatMap((loc, i) => [
          ...(i > 0 ? [text(", ")] : []),
          text(locationLabel(loc), [
            { type: "link", attrs: { href: bitbucketSourceUrl(audit, loc) } },
          ]),
        ]),
        text(` at audited commit ${audit.auditedCommit.slice(0, 7)}`),
      ]),
    );
  } else {
    blocks.push(
      paragraph(
        inline(
          "**Location:** not given in the report, so AuditGate can't track changes to this code.",
        ),
      ),
    );
  }

  const where = [finding.contract, finding.fn].filter(Boolean).join(".");
  if (where)
    blocks.push(paragraph([text("Code: ", [{ type: "strong" }]), text(where, [{ type: "code" }])]));

  if (finding.description.trim()) {
    blocks.push(heading(3, "Description"), ...markdownToBlocks(finding.description));
  }
  if (finding.recommendation?.trim()) {
    blocks.push(heading(3, "Recommendation"), ...markdownToBlocks(finding.recommendation));
  }
  blocks.push(
    { type: "rule" },
    paragraph([
      text(
        "Managed by AuditGate. Re-importing the report overwrites this description, so add notes as comments.",
        [{ type: "em" }],
      ),
    ]),
  );
  return doc(blocks);
}

export function issueProperty(finding: Finding): IssueProperty {
  return {
    auditId: finding.auditId,
    findingId: finding.id,
    externalId: finding.externalId,
    severity: finding.severity,
    severityRank: SEVERITY_RANK[finding.severity],
    status: finding.status,
    file: finding.file,
  };
}

/** What the target project lets us set when creating an issue. */
export interface CreateContext {
  projectId: string;
  issueTypeId: string;
  /** Allowed priorities, or undefined when priority isn't on the create screen. */
  priorities?: { id: string; name: string }[];
  /** False when labels aren't on the create screen. */
  labels: boolean;
}

export interface IssueFields {
  project?: { id: string };
  issuetype?: { id: string };
  summary: string;
  description: AdfDoc;
  labels?: string[];
  priority?: { id: string };
}

/** Body of one element of POST /rest/api/3/issue/bulk. */
export function createIssueBody(
  finding: Finding,
  audit: Pick<Audit, "id" | "repo" | "auditedCommit" | "name">,
  ctx: CreateContext,
): { fields: IssueFields; properties: { key: string; value: IssueProperty }[] } {
  const fields: IssueFields = {
    project: { id: ctx.projectId },
    issuetype: { id: ctx.issueTypeId },
    ...updateIssueFields(finding, audit, ctx),
  };
  return { fields, properties: [{ key: ISSUE_PROPERTY_KEY, value: issueProperty(finding) }] };
}

/** Fields for PUT /rest/api/3/issue/{key} on re-import. Project and type never change. */
export function updateIssueFields(
  finding: Finding,
  audit: Pick<Audit, "id" | "repo" | "auditedCommit" | "name">,
  ctx: Pick<CreateContext, "priorities" | "labels">,
): IssueFields {
  const fields: IssueFields = {
    summary: issueSummary(finding),
    description: issueDescription(finding, audit),
  };
  if (ctx.labels) fields.labels = issueLabels(finding, audit.id);
  const priorityId = ctx.priorities ? pickPriorityId(finding.severity, ctx.priorities) : undefined;
  if (priorityId) fields.priority = { id: priorityId };
  return fields;
}
