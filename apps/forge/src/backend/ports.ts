import type { CreateContext, IssueFields, IssueProperty, StoredFinding } from "@auditgate/jira";
import type { StoredAudit } from "../shared/contract";

/** Reverse link from a Jira issue to the finding it tracks. */
export interface IssueLink {
  issueId: string;
  issueKey: string;
  projectId: string;
  auditId: string;
  findingId: string;
}

/** Everything AuditGate keeps in Forge storage. */
export interface Store {
  getAudit(projectId: string, auditId: string): Promise<StoredAudit | undefined>;
  listAudits(projectId: string): Promise<StoredAudit[]>;
  /** Every audit on the site, across projects. Callers must filter by what the user can see. */
  listAllAudits(): Promise<StoredAudit[]>;
  putAudit(audit: StoredAudit): Promise<void>;
  listFindings(auditId: string): Promise<StoredFinding[]>;
  getFinding(auditId: string, findingId: string): Promise<StoredFinding | undefined>;
  putFindings(findings: StoredFinding[]): Promise<void>;
  getIssueLink(issueId: string): Promise<IssueLink | undefined>;
  putIssueLinks(links: IssueLink[]): Promise<void>;
}

export interface CreatedIssue {
  /** Position in the request. */
  index: number;
  id: string;
  key: string;
}

export interface FailedIssue {
  index: number;
  message: string;
}

export interface IssueBody {
  fields: IssueFields;
  properties: { key: string; value: IssueProperty }[];
}

export interface Jira {
  /**
   * What the app can set when creating issues in the project. Throws JiraError with a
   * plain-language message when the project can't take issues.
   */
  createContext(projectId: string): Promise<CreateContext>;
  /** Up to 50 issues per call. */
  createIssues(bodies: IssueBody[]): Promise<{ created: CreatedIssue[]; failed: FailedIssue[] }>;
  updateIssue(issueKey: string, fields: IssueFields): Promise<void>;
  setFindingProperty(issueKey: string, value: IssueProperty): Promise<void>;
  /** Issues already carrying this audit's property. Used to recover after a crash mid-import. */
  findAuditIssues(auditId: string): Promise<{ id: string; key: string; findingId: string }[]>;
  /** Display name of each issue's assignee, or null when unassigned. */
  getAssignees(issueKeys: string[]): Promise<Record<string, string | null>>;
  /** Display names for Atlassian account IDs. Unknown IDs are left out. */
  getUserNames(accountIds: string[]): Promise<Record<string, string>>;
}

/** The user-facing check: can this person create issues in the project? */
export interface UserJira {
  canCreateIssues(projectId: string): Promise<boolean>;
  /** The project as the current user sees it, or null if it doesn't exist or they can't browse it. */
  visibleProject(projectIdOrKey: string): Promise<{ id: string; key: string; name: string } | null>;
}

export interface ImportQueue {
  push(job: ImportJob): Promise<void>;
}

export interface ImportJob {
  projectId: string;
  auditId: string;
}

export class JiraError extends Error {
  override readonly name = "JiraError";
}

export class UserError extends Error {
  override readonly name = "UserError";
}
