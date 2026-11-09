import {
  TRANSITIONS,
  TransitionError,
  compareSeverity,
  transition,
  type Finding,
  type FindingStatus,
  type Severity,
} from "@auditgate/core";
import { computeDrift, parseChangedFiles } from "@auditgate/drift";
import { evaluateGate } from "@auditgate/gate";
import {
  bitbucketSourceUrl,
  contentHash,
  createIssueBody,
  locationLabel,
  mergeImport,
  needsSync,
  pickPriorityId,
  updateIssueFields,
  type CreateContext,
  type StoredFinding,
} from "@auditgate/jira";
import {
  ReportParseError,
  decodeUpload,
  normalizePath,
  parseReport,
  type ParseResult,
} from "@auditgate/parsers";
import type {
  AuditDetail,
  AuditSummary,
  ChangeStatusInput,
  CheckChangeInput,
  CheckChangeResult,
  CreateAuditInput,
  FindingRow,
  ImportStatus,
  ImportSummary,
  PanelView,
  ReimportInput,
  ReportPreview,
  ReportUpload,
  StoredAudit,
} from "../shared/contract";
import {
  JiraError,
  UserError,
  type ImportJob,
  type ImportQueue,
  type IssueBody,
  type IssueLink,
  type Jira,
  type Store,
  type UserJira,
} from "./ports";

export type { ImportJob } from "./ports";

export interface Deps {
  store: Store;
  jira: Jira;
  userJira: UserJira;
  queue: ImportQueue;
  now: () => string;
  newId: () => string;
}

export interface Caller {
  projectId: string;
  projectKey: string;
  accountId: string;
}

const SHA = /^[0-9a-f]{40}$/;
const BITBUCKET_ID = /^[A-Za-z0-9_.-]{1,62}$/;
const BULK_LIMIT = 50;
const UPDATE_CONCURRENCY = 5;
const SOURCE_NAMES: Record<Finding["source"], string> = {
  slither: "Slither",
  aderyn: "Aderyn",
  markdown: "Markdown report",
};

function parseUpload(upload: ReportUpload): ParseResult {
  if (!upload?.data) throw new UserError("Choose a report file or paste the report first.");
  try {
    return parseReport(decodeUpload(upload.data), upload.fileName ?? "");
  } catch (error) {
    if (error instanceof ReportParseError) throw new UserError(error.message);
    throw error;
  }
}

function countBy<K extends string>(
  items: { [key: string]: unknown }[],
  key: string,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const item of items) {
    const value = item[key] as K;
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

export function previewReport(upload: ReportUpload): ReportPreview {
  const result = parseUpload(upload);
  return {
    format: result.format,
    total: result.findings.length,
    bySeverity: countBy<Severity>(result.findings as never, "severity"),
    warnings: result.warnings,
    meta: result.meta,
    files: [...new Set(result.findings.map((f) => f.file).filter(Boolean))].sort(),
  };
}

function validateAuditInput(input: CreateAuditInput): void {
  const problems: string[] = [];
  if (!input.name?.trim()) problems.push("Give the audit a name.");
  if (input.name?.length > 120) problems.push("Keep the audit name under 120 characters.");
  if (!input.auditor?.trim()) problems.push('Say who did the audit, or write "Internal".');
  if (!BITBUCKET_ID.test(input.workspace?.trim() ?? ""))
    problems.push("Enter the Bitbucket workspace ID, for example auditgate-demo.");
  if (!BITBUCKET_ID.test(input.repoSlug?.trim() ?? ""))
    problems.push("Enter the repository slug, for example vault-v2.");
  if (!SHA.test(input.auditedCommit?.trim().toLowerCase() ?? "")) {
    problems.push(
      "The audited commit must be the full 40-character SHA. In the repo, run: git rev-parse HEAD",
    );
  }
  if (problems.length) throw new UserError(problems.join(" "));
}

function emptyImport(now: string, total: number): ImportStatus {
  return { state: "queued", total, created: 0, updated: 0, failed: 0, messages: [], queuedAt: now };
}

function importSummary(merge: ReturnType<typeof mergeImport>, warnings: string[]): ImportSummary {
  return {
    added: merge.added,
    changed: merge.changed,
    unchanged: merge.unchanged,
    missing: merge.missing,
    warnings,
  };
}

export async function createAudit(
  deps: Deps,
  caller: Caller,
  input: CreateAuditInput,
): Promise<AuditSummary> {
  validateAuditInput(input);
  const parsed = parseUpload(input.report);
  if (parsed.findings.length === 0)
    throw new UserError("The report has no findings, so there's nothing to import.");
  if (!(await deps.userJira.canCreateIssues(caller.projectId))) {
    throw new UserError(
      "You don't have permission to create issues in this project, so AuditGate can't import for you.",
    );
  }

  const id = deps.newId();
  const now = deps.now();
  const scopeInput = (input.scope ?? []).map(normalizePath).filter(Boolean);
  const scope = scopeInput.length
    ? scopeInput
    : (parsed.meta.scope ??
      [...new Set(parsed.findings.map((f) => f.file).filter(Boolean))].sort());

  const merge = mergeImport([], parsed.findings, id);
  const audit: StoredAudit = {
    id,
    name: input.name.trim(),
    auditor: input.auditor.trim(),
    repo: { workspace: input.workspace.trim(), slug: input.repoSlug.trim() },
    auditedCommit: input.auditedCommit.trim().toLowerCase(),
    auditedFiles: [...new Set(scope)],
    createdAt: now,
    projectId: caller.projectId,
    projectKey: caller.projectKey,
    createdBy: caller.accountId,
    reportFormat: parsed.format,
    settings: { blockOnUnreviewedChanges: Boolean(input.blockOnUnreviewedChanges) },
    import: emptyImport(now, merge.findings.length),
    lastImport: importSummary(merge, parsed.warnings),
  };

  await deps.store.putFindings(merge.findings);
  await deps.store.putAudit(audit);
  await deps.queue.push({ projectId: caller.projectId, auditId: id });
  return summarize(audit, merge.findings);
}

export async function reimport(
  deps: Deps,
  caller: Caller,
  input: ReimportInput,
): Promise<AuditSummary> {
  const audit = await deps.store.getAudit(caller.projectId, input.auditId);
  if (!audit) throw new UserError("That audit doesn't exist in this project any more.");
  if (audit.import.state === "queued" || audit.import.state === "running") {
    throw new UserError(
      "An import for this audit is still running. Wait for it to finish, then try again.",
    );
  }
  const parsed = parseUpload(input.report);
  if (!(await deps.userJira.canCreateIssues(caller.projectId))) {
    throw new UserError(
      "You don't have permission to create issues in this project, so AuditGate can't import for you.",
    );
  }

  const existing = await deps.store.listFindings(audit.id);
  const merge = mergeImport(existing, parsed.findings, audit.id);
  const pending = merge.findings.filter(needsSync).length;
  const updated: StoredAudit = {
    ...audit,
    reportFormat: parsed.format,
    import: emptyImport(deps.now(), pending),
    lastImport: importSummary(merge, parsed.warnings),
  };
  if (pending === 0) {
    updated.import = {
      ...updated.import,
      state: "done",
      finishedAt: deps.now(),
      messages: ["Nothing changed since the last import."],
    };
  }

  await deps.store.putFindings(merge.findings);
  await deps.store.putAudit(updated);
  if (pending > 0) await deps.queue.push({ projectId: caller.projectId, auditId: audit.id });
  return summarize(updated, merge.findings);
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The import job. Safe to run more than once for the same audit: each created issue's key is
 * saved straight after its batch, and before creating anything the job looks for issues that
 * already carry this audit's property, so a crash between "Jira created it" and "we saved the
 * key" can't produce a duplicate.
 */
export async function runImport(deps: Deps, job: ImportJob): Promise<void> {
  const audit = await deps.store.getAudit(job.projectId, job.auditId);
  if (!audit) return;

  const status: ImportStatus = {
    ...audit.import,
    state: "running",
    created: 0,
    updated: 0,
    failed: 0,
    messages: [],
  };
  const save = async () =>
    deps.store.putAudit({ ...audit, import: { ...status, messages: status.messages.slice(-20) } });
  await save();

  try {
    let ctx: CreateContext = await deps.jira.createContext(audit.projectId);
    const findings = await deps.store.listFindings(audit.id);
    const byId = new Map(findings.map((f) => [f.id, f]));

    // Team-managed projects often leave Priority off the create screen but allow it on edit.
    // Then the priority is set right after each issue is created. Looked up once per run.
    let editPriorities: { id: string; name: string }[] | undefined | null = null;
    const prioritiesForEdit = async (issueKey: string) => {
      if (ctx.priorities) return ctx.priorities;
      if (editPriorities === null) {
        editPriorities = await deps.jira.editPriorities(issueKey).catch(() => undefined);
      }
      return editPriorities;
    };

    // Recover keys of issues created by an earlier run that didn't get to save them.
    if (findings.some((f) => !f.jiraKey)) {
      const links: IssueLink[] = [];
      for (const issue of await deps.jira.findAuditIssues(audit.id)) {
        const finding = byId.get(issue.findingId);
        if (finding && !finding.jiraKey) {
          finding.jiraKey = issue.key;
          links.push({
            issueId: issue.id,
            issueKey: issue.key,
            projectId: audit.projectId,
            auditId: audit.id,
            findingId: finding.id,
          });
        }
      }
      if (links.length) {
        await deps.store.putFindings(
          findings.filter((f) => links.some((l) => l.findingId === f.id)),
        );
        await deps.store.putIssueLinks(links);
      }
    }

    // Most severe first, so C-01 gets the lowest issue number.
    const toCreate = findings
      .filter((f) => !f.jiraKey)
      .sort(
        (a, b) =>
          compareSeverity(a.severity, b.severity) || a.externalId.localeCompare(b.externalId),
      );
    const toUpdate = findings.filter((f) => f.jiraKey && needsSync(f));
    status.total = toCreate.length + toUpdate.length;

    for (const batch of chunk(toCreate, BULK_LIMIT)) {
      let result = await deps.jira.createIssues(
        batch.map((f) => createIssueBody(f, audit, ctx) as IssueBody),
      );

      // Some projects keep labels or priority off the create screen. Retry those without them.
      if (result.failed.length && (ctx.labels || ctx.priorities)) {
        const retryIdx = result.failed.map((f) => f.index);
        const plain: CreateContext = {
          projectId: ctx.projectId,
          issueTypeId: ctx.issueTypeId,
          labels: false,
        };
        const retry = await deps.jira.createIssues(
          retryIdx.map(
            (i) => createIssueBody(batch[i] as StoredFinding, audit, plain) as IssueBody,
          ),
        );
        if (retry.created.length) {
          status.messages.push(
            "Some issues were created without labels or priority because the project's create screen doesn't allow them.",
          );
          ctx = plain;
        }
        result = {
          created: [
            ...result.created,
            ...retry.created.map((c) => ({ ...c, index: retryIdx[c.index] as number })),
          ],
          failed: retry.failed.map((f) => ({ ...f, index: retryIdx[f.index] as number })),
        };
      }

      const saved: StoredFinding[] = [];
      const links: IssueLink[] = [];
      for (const created of result.created) {
        const finding = batch[created.index];
        if (!finding) continue;
        finding.jiraKey = created.key;
        finding.syncedHash = contentHash(finding);
        saved.push(finding);
        links.push({
          issueId: created.id,
          issueKey: created.key,
          projectId: audit.projectId,
          auditId: audit.id,
          findingId: finding.id,
        });
      }
      await deps.store.putFindings(saved);
      await deps.store.putIssueLinks(links);
      status.created += saved.length;

      if (!ctx.priorities && saved[0]?.jiraKey) {
        const allowed = await prioritiesForEdit(saved[0].jiraKey);
        let missed = 0;
        if (allowed) {
          await mapLimit(saved, UPDATE_CONCURRENCY, async (finding) => {
            const priorityId = pickPriorityId(finding.severity, allowed);
            if (!priorityId) return;
            await deps.jira
              .setPriority(finding.jiraKey as string, priorityId)
              .catch(() => void missed++);
          });
        }
        if (missed) {
          status.messages.push(
            `Priority couldn't be set on ${missed} issue${missed === 1 ? "" : "s"}. The severity is still in the labels and the AuditGate panel.`,
          );
        }
      }
      for (const failed of result.failed) {
        status.failed++;
        status.messages.push(
          `${batch[failed.index]?.externalId ?? "A finding"} wasn't created: ${failed.message}`,
        );
      }
      await save();
    }

    const editCtx: CreateContext = { ...ctx };
    if (toUpdate[0]?.jiraKey && !ctx.priorities) {
      const allowed = await prioritiesForEdit(toUpdate[0].jiraKey);
      if (allowed) editCtx.priorities = allowed;
    }
    await mapLimit(toUpdate, UPDATE_CONCURRENCY, async (finding) => {
      try {
        await deps.jira.updateIssue(
          finding.jiraKey as string,
          updateIssueFields(finding, audit, editCtx),
        );
        await deps.jira.setFindingProperty(
          finding.jiraKey as string,
          createIssueBody(finding, audit, ctx).properties[0]!.value,
        );
        finding.syncedHash = contentHash(finding);
        await deps.store.putFindings([finding]);
        status.updated++;
      } catch (error) {
        status.failed++;
        status.messages.push(
          `${finding.externalId} (${finding.jiraKey}) wasn't updated: ${(error as Error).message}`,
        );
      }
    });

    status.state = status.failed ? "failed" : "done";
    if (!status.failed) {
      status.messages.push(
        `Created ${status.created} and updated ${status.updated} issue${status.created + status.updated === 1 ? "" : "s"}.`,
      );
    }
  } catch (error) {
    status.state = "failed";
    status.messages.push(
      error instanceof JiraError
        ? error.message
        : `The import stopped: ${(error as Error).message}`,
    );
  }
  status.finishedAt = deps.now();
  await save();
}

function rowFor(audit: StoredAudit, f: StoredFinding): FindingRow {
  const row: FindingRow = {
    id: f.id,
    externalId: f.externalId,
    severity: f.severity,
    title: f.title,
    file: f.file,
    status: f.status,
  };
  if (f.lines) row.lines = f.lines;
  if (f.jiraKey) row.jiraKey = f.jiraKey;
  if (f.file)
    row.sourceUrl = bitbucketSourceUrl(
      audit,
      f.lines ? { file: f.file, lines: f.lines } : { file: f.file },
    );
  const last = f.history[f.history.length - 1];
  if (last) row.lastChange = last.at;
  return row;
}

export function summarize(audit: StoredAudit, findings: StoredFinding[]): AuditSummary {
  const gate = evaluateGate(findings);
  return {
    id: audit.id,
    name: audit.name,
    auditor: audit.auditor,
    repo: `${audit.repo.workspace}/${audit.repo.slug}`,
    auditedCommit: audit.auditedCommit,
    createdAt: audit.createdAt,
    total: findings.length,
    bySeverity: countBy<Severity>(findings as never, "severity"),
    byStatus: countBy<FindingStatus>(findings as never, "status"),
    gate: { pass: gate.pass, message: gate.message },
    import: audit.import,
  };
}

export async function listAudits(deps: Deps, projectId: string): Promise<AuditSummary[]> {
  const audits = await deps.store.listAudits(projectId);
  const summaries = await Promise.all(
    audits.map(async (a) => summarize(a, await deps.store.listFindings(a.id))),
  );
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAudit(
  deps: Deps,
  projectId: string,
  auditId: string,
): Promise<AuditDetail> {
  const audit = await deps.store.getAudit(projectId, auditId);
  if (!audit) throw new UserError("That audit doesn't exist in this project.");
  const findings = await deps.store.listFindings(auditId);
  findings.sort(
    (a, b) => compareSeverity(a.severity, b.severity) || a.externalId.localeCompare(b.externalId),
  );
  return {
    summary: summarize(audit, findings),
    scope: audit.auditedFiles,
    settings: audit.settings,
    lastImport: audit.lastImport,
    findings: findings.map((f) => rowFor(audit, f)),
  };
}

/** Statuses a person can pick in the panel. Drifted comes from the drift check, Verified from Re-check. */
export function manualTransitions(from: FindingStatus): FindingStatus[] {
  return TRANSITIONS[from].filter((to) => to !== "Drifted" && to !== "Verified");
}

async function loadForIssue(deps: Deps, issueId: string) {
  const link = await deps.store.getIssueLink(issueId);
  if (!link) return undefined;
  const [audit, finding] = await Promise.all([
    deps.store.getAudit(link.projectId, link.auditId),
    deps.store.getFinding(link.auditId, link.findingId),
  ]);
  if (!audit || !finding) return undefined;
  return { link, audit, finding };
}

function panelView(audit: StoredAudit, finding: StoredFinding): PanelView {
  const locations = finding.file
    ? [
        finding.lines ? { file: finding.file, lines: finding.lines } : { file: finding.file },
        ...(finding.extraLocations ?? []),
      ]
    : [];
  const view: PanelView = {
    finding: {
      externalId: finding.externalId,
      severity: finding.severity,
      status: finding.status,
      title: finding.title,
      source: SOURCE_NAMES[finding.source],
      locations: locations.map((loc) => ({
        label: locationLabel(loc),
        url: bitbucketSourceUrl(audit, loc),
      })),
      history: finding.history,
    },
    audit: {
      id: audit.id,
      name: audit.name,
      auditor: audit.auditor,
      auditedCommit: audit.auditedCommit,
      repo: `${audit.repo.workspace}/${audit.repo.slug}`,
    },
    allowedTransitions: manualTransitions(finding.status),
  };
  if (finding.contract) view.finding.contract = finding.contract;
  if (finding.fn) view.finding.fn = finding.fn;
  if (finding.recommendation) view.finding.recommendation = finding.recommendation;
  return view;
}

export async function getPanel(deps: Deps, issueId: string): Promise<PanelView | null> {
  const loaded = await loadForIssue(deps, issueId);
  return loaded ? panelView(loaded.audit, loaded.finding) : null;
}

export async function changeStatus(
  deps: Deps,
  issueId: string,
  accountId: string,
  input: ChangeStatusInput,
): Promise<PanelView> {
  const loaded = await loadForIssue(deps, issueId);
  if (!loaded) throw new UserError("This issue isn't linked to an AuditGate finding.");
  const { audit, finding } = loaded;
  if (!manualTransitions(finding.status).includes(input.to)) {
    throw new UserError(
      `${finding.externalId} can't move from ${finding.status} to ${input.to} here.`,
    );
  }

  let next: StoredFinding;
  try {
    next = transition(finding, {
      to: input.to,
      by: accountId,
      at: deps.now(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(input.approver ? { approver: input.approver } : {}),
    });
  } catch (error) {
    if (error instanceof TransitionError) throw new UserError(error.message);
    throw error;
  }

  await deps.store.putFindings([next]);
  if (next.jiraKey) {
    const ctx: CreateContext = { projectId: audit.projectId, issueTypeId: "", labels: false };
    await deps.jira.setFindingProperty(
      next.jiraKey,
      createIssueBody(next, audit, ctx).properties[0]!.value,
    );
  }
  return panelView(audit, next);
}

/**
 * "Check a change": what the merge check would say about a set of changed files, without
 * Bitbucket. Compares against the audited commit. Read-only; nothing is stored.
 */
export async function checkChange(
  deps: Deps,
  projectId: string,
  input: CheckChangeInput,
): Promise<CheckChangeResult> {
  const audit = await deps.store.getAudit(projectId, input.auditId);
  if (!audit) throw new UserError("That audit doesn't exist in this project.");
  const changes = parseChangedFiles(input.changedFiles ?? "");
  if (changes.length === 0) {
    throw new UserError(
      `Paste at least one changed file. In the repo, run: git diff --name-status ${audit.auditedCommit.slice(0, 7)} HEAD`,
    );
  }
  const findings = (await deps.store.listFindings(audit.id)).sort(
    (a, b) => compareSeverity(a.severity, b.severity) || a.externalId.localeCompare(b.externalId),
  );
  const drift = computeDrift({ auditedFiles: audit.auditedFiles, findings, changes });
  const gate = evaluateGate(findings, drift, {
    blockOnUnreviewedChanges: audit.settings.blockOnUnreviewedChanges,
  });
  const byFile = new Map<string, string[]>();
  for (const d of drift.driftedFindings) {
    for (const file of d.files) byFile.set(file, [...(byFile.get(file) ?? []), d.externalId]);
  }
  return {
    comparedTo: audit.auditedCommit,
    filesRead: changes.length,
    gate,
    changedAuditedFiles: drift.changedFiles.map((f) => ({
      path: f.path,
      status: f.status,
      ...(f.renamedTo ? { renamedTo: f.renamedTo } : {}),
      findings: byFile.get(f.path) ?? [],
    })),
    outOfScopeFiles: drift.outOfScopeFiles,
  };
}
