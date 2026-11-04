import {
  compareSeverity,
  isGatingSeverity,
  type FindingStatus,
  type Severity,
} from "@auditgate/core";
import { evaluateGate } from "@auditgate/gate";
import type { StoredFinding } from "@auditgate/jira";
import type { StoredAudit } from "../shared/contract";
import { UserError } from "./ports";
import { checkChange, type Deps } from "./service";

/**
 * The logic behind AuditGate's Rovo actions and MCP tools. Every action is read-only, answers
 * only about projects the calling user can browse, and returns small, plain JSON so the agent
 * can quote it. Nothing here changes a finding.
 */

/** What Rovo passes in. Inputs come from the model and are untrusted; context comes from Jira. */
export interface ActionPayload {
  projectKey?: string;
  audit?: string;
  severity?: string;
  finding?: string;
  changedFiles?: string;
  context?: {
    jira?: { projectKey?: string; projectId?: string | number; issueKey?: string | number };
  };
}

const OPEN_STATUSES: readonly FindingStatus[] = ["Open", "InFix", "FixedPendingRecheck", "Drifted"];
const MAX_LIST = 25;

const STATUS_WORDS: Record<FindingStatus, string> = {
  Open: "Open",
  InFix: "In fix",
  FixedPendingRecheck: "Fixed, awaiting re-check",
  Verified: "Verified",
  Drifted: "Drifted",
  AcceptedRisk: "Accepted risk",
};

function clean(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

interface Resolved {
  audit: StoredAudit;
  findings: StoredFinding[];
  project: { id: string; key: string; name: string };
  /** Other audits in the same project, so the agent can offer them. */
  otherAudits: string[];
}

/**
 * Finds the audit an action is about. Order: the project from the input, else from the Jira
 * page the user is on. Within a project: the audit named in the input, else the newest. With no
 * project at all, the newest audit across every project the user can browse.
 */
export async function resolveAudit(deps: Deps, payload: ActionPayload): Promise<Resolved> {
  const requested = clean(payload.projectKey, 50).toUpperCase();
  const fromPage = payload.context?.jira?.projectKey ?? payload.context?.jira?.projectId;
  const projectRef = requested || (fromPage !== undefined ? String(fromPage) : "");

  let candidates: { audit: StoredAudit; project: Resolved["project"] }[] = [];
  if (projectRef) {
    const project = await deps.userJira.visibleProject(projectRef);
    if (!project) {
      throw new UserError(
        `I can't find a project "${projectRef}" that you have access to. Check the project key.`,
      );
    }
    candidates = (await deps.store.listAudits(project.id)).map((audit) => ({ audit, project }));
  } else {
    const all = await deps.store.listAllAudits();
    const visible = new Map<string, Resolved["project"] | null>();
    for (const audit of all) {
      if (!visible.has(audit.projectId)) {
        visible.set(audit.projectId, await deps.userJira.visibleProject(audit.projectId));
      }
      const project = visible.get(audit.projectId);
      if (project) candidates.push({ audit, project });
    }
  }

  if (candidates.length === 0) {
    throw new UserError(
      projectRef
        ? "This project has no AuditGate audits yet. Import a report from the AuditGate tab in the project."
        : "I can't find any AuditGate audits you have access to. Import a report from the AuditGate tab in a Jira project.",
    );
  }

  candidates.sort((a, b) => b.audit.createdAt.localeCompare(a.audit.createdAt));
  const wanted = clean(payload.audit, 120).toLowerCase();
  const match = wanted
    ? candidates.find((c) => c.audit.id === wanted || c.audit.name.toLowerCase().includes(wanted))
    : candidates[0];
  if (!match) {
    throw new UserError(
      `No audit matches "${payload.audit}". Audits you can see: ${candidates.map((c) => `${c.audit.name} (${c.project.key})`).join("; ")}.`,
    );
  }

  const findings = await deps.store.listFindings(match.audit.id);
  findings.sort(
    (a, b) => compareSeverity(a.severity, b.severity) || a.externalId.localeCompare(b.externalId),
  );
  return {
    audit: match.audit,
    findings,
    project: match.project,
    otherAudits: candidates
      .filter((c) => c !== match)
      .map((c) => `${c.audit.name} (${c.project.key})`),
  };
}

function auditInfo(r: Resolved) {
  return {
    name: r.audit.name,
    auditor: r.audit.auditor,
    project: r.project.key,
    repository: `${r.audit.repo.workspace}/${r.audit.repo.slug}`,
    auditedCommit: r.audit.auditedCommit,
    importedAt: r.audit.createdAt,
    ...(r.otherAudits.length ? { otherAuditsYouCanAskAbout: r.otherAudits } : {}),
  };
}

function brief(f: StoredFinding) {
  return {
    id: f.externalId,
    jiraKey: f.jiraKey ?? "not created yet",
    severity: f.severity,
    status: STATUS_WORDS[f.status],
    title: f.title,
    file: f.file || "no location given",
  };
}

function countBy<K extends string>(items: StoredFinding[], pick: (f: StoredFinding) => K) {
  const out: Partial<Record<K, number>> = {};
  for (const f of items) out[pick(f)] = (out[pick(f)] ?? 0) + 1;
  return out;
}

/** "Is this release safe to ship?" */
export async function releaseReadiness(deps: Deps, payload: ActionPayload) {
  const r = await resolveAudit(deps, payload);
  const gate = evaluateGate(r.findings);
  const byId = new Map(r.findings.map((f) => [f.externalId, f]));
  return {
    audit: auditInfo(r),
    safeToShip: gate.pass,
    gateMessage: gate.message,
    blocking: gate.blocking.map((id) => brief(byId.get(id) as StoredFinding)),
    acceptedRisks: gate.accepted.map((id) => brief(byId.get(id) as StoredFinding)),
    findingsBySeverity: countBy(r.findings, (f) => f.severity),
    findingsByStatus: countBy(r.findings, (f) => STATUS_WORDS[f.status]),
    codeChanges:
      "This answer covers finding status only. To include code changed since the audit, use the check-drift action with the list of changed files.",
  };
}

const SEVERITY_WORDS: Record<string, Severity> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Informational",
  info: "Informational",
  gas: "Gas",
};

/** "Summarize open findings by severity", "List the open High findings". */
export async function listOpenFindings(deps: Deps, payload: ActionPayload) {
  const r = await resolveAudit(deps, payload);
  const severityWord = clean(payload.severity, 30).toLowerCase();
  const severity = severityWord ? SEVERITY_WORDS[severityWord] : undefined;
  if (severityWord && !severity) {
    throw new UserError(
      `"${payload.severity}" isn't a severity. Use Critical, High, Medium, Low, Informational or Gas.`,
    );
  }
  const open = r.findings.filter(
    (f) => OPEN_STATUSES.includes(f.status) && (!severity || f.severity === severity),
  );
  return {
    audit: auditInfo(r),
    filter: severity
      ? `${severity} findings that are not verified or accepted`
      : "findings that are not verified or accepted",
    openCount: open.length,
    openBySeverity: countBy(open, (f) => f.severity),
    blocksRelease: open.some((f) => isGatingSeverity(f.severity)),
    findings: open.slice(0, MAX_LIST).map(brief),
    ...(open.length > MAX_LIST
      ? { note: `Showing the ${MAX_LIST} most severe of ${open.length}.` }
      : {}),
  };
}

/** "Who owns H-03?", "What's the recommendation for KAN-2?" */
export async function getFinding(deps: Deps, payload: ActionPayload) {
  const wanted =
    clean(payload.finding, 40).toUpperCase() ||
    clean(String(payload.context?.jira?.issueKey ?? ""), 40).toUpperCase();
  if (!wanted)
    throw new UserError(
      "Say which finding: its audit ID such as H-03, or its Jira key such as KAN-3.",
    );
  const r = await resolveAudit(deps, payload);
  const finding = r.findings.find(
    (f) => f.externalId.toUpperCase() === wanted || f.jiraKey?.toUpperCase() === wanted,
  );
  if (!finding) {
    const ids = r.findings.map((f) => f.externalId);
    throw new UserError(
      `${wanted} isn't a finding in ${r.audit.name}. Its findings are ${ids.slice(0, 20).join(", ")}${ids.length > 20 ? ` and ${ids.length - 20} more` : ""}.`,
    );
  }

  const [assignees, names] = await Promise.all([
    finding.jiraKey
      ? deps.jira.getAssignees([finding.jiraKey])
      : Promise.resolve({} as Record<string, string | null>),
    deps.jira.getUserNames([
      ...new Set(finding.history.map((h) => h.by).filter((by) => by !== "auditgate")),
    ]),
  ]);
  const owner = finding.jiraKey ? assignees[finding.jiraKey] : null;

  return {
    audit: auditInfo(r),
    finding: {
      ...brief(finding),
      lines: finding.lines ? `${finding.lines[0]}-${finding.lines[1]}` : undefined,
      code: [finding.contract, finding.fn].filter(Boolean).join(".") || undefined,
      owner: owner ?? "Unassigned in Jira",
      recommendation: finding.recommendation?.slice(0, 600) ?? "The report gave no recommendation.",
      description: finding.description.slice(0, 600),
      blocksRelease: isGatingSeverity(finding.severity) && OPEN_STATUSES.includes(finding.status),
      history: finding.history.slice(-5).map((h) => ({
        when: h.at,
        who: h.by === "auditgate" ? "AuditGate" : (names[h.by] ?? "a Jira user"),
        from: STATUS_WORDS[h.from],
        to: STATUS_WORDS[h.to],
        ...(h.note ? { note: h.note.slice(0, 200) } : {}),
      })),
    },
  };
}

/** "What changed since the audit?", "Would this branch be blocked?" */
export async function checkDrift(deps: Deps, payload: ActionPayload) {
  const r = await resolveAudit(deps, payload);
  const files = clean(payload.changedFiles, 20_000);
  if (!files) {
    return {
      audit: auditInfo(r),
      needsInput: true,
      howToGetTheList: `AuditGate needs the list of files changed since the audited commit. In the repository, run: git diff --name-status ${r.audit.auditedCommit} HEAD — then paste the output.`,
      auditedFiles: r.audit.auditedFiles,
    };
  }
  const result = await checkChange(deps, r.project.id, {
    auditId: r.audit.id,
    changedFiles: files,
  });
  const byId = new Map(r.findings.map((f) => [f.externalId, f]));
  return {
    audit: auditInfo(r),
    comparedWithCommit: result.comparedTo,
    filesRead: result.filesRead,
    safeToMerge: result.gate.pass,
    gateMessage: result.gate.message,
    changedAuditedFiles: result.changedAuditedFiles.map((f) => ({
      file: f.path,
      change: f.renamedTo ? `renamed to ${f.renamedTo}` : f.status,
      affectedFindings: f.findings.map((id) => {
        const finding = byId.get(id);
        return finding
          ? `${id} (${finding.jiraKey ?? "no issue"}, ${finding.severity}, ${STATUS_WORDS[finding.status]})`
          : id;
      }),
    })),
    outOfScopeFiles: result.outOfScopeFiles.slice(0, 20),
  };
}
