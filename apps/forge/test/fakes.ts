import type { CreateContext, IssueFields, IssueProperty, StoredFinding } from "@auditgate/jira";
import type { StoredAudit } from "../src/shared/contract";
import type { ImportJob, IssueBody, IssueLink, Jira, Store } from "../src/backend/ports";
import type { Deps } from "../src/backend/service";

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory Store. Values are cloned in and out, like real storage. */
export class MemoryStore implements Store {
  audits = new Map<string, StoredAudit>();
  findings = new Map<string, StoredFinding>();
  links = new Map<string, IssueLink>();

  async getAudit(projectId: string, auditId: string) {
    const a = this.audits.get(`${projectId}:${auditId}`);
    return a && clone(a);
  }
  async listAudits(projectId: string) {
    return [...this.audits.values()].filter((a) => a.projectId === projectId).map(clone);
  }
  async putAudit(audit: StoredAudit) {
    this.audits.set(`${audit.projectId}:${audit.id}`, clone(audit));
  }
  async listFindings(auditId: string) {
    return [...this.findings.values()].filter((f) => f.auditId === auditId).map(clone);
  }
  async getFinding(auditId: string, findingId: string) {
    const f = this.findings.get(`${auditId}:${findingId}`);
    return f && clone(f);
  }
  async putFindings(findings: StoredFinding[]) {
    for (const f of findings) this.findings.set(`${f.auditId}:${f.id}`, clone(f));
  }
  async getIssueLink(issueId: string) {
    const l = this.links.get(issueId);
    return l && clone(l);
  }
  async putIssueLinks(links: IssueLink[]) {
    for (const l of links) this.links.set(l.issueId, clone(l));
  }
}

export interface FakeIssue {
  id: string;
  key: string;
  fields: IssueFields;
  property: IssueProperty;
}

/** In-memory Jira with switches for the failure modes the importer has to handle. */
export class FakeJira implements Jira {
  issues: FakeIssue[] = [];
  bulkCalls = 0;
  updates: string[] = [];
  /** Reject any create that sets labels, like a project whose create screen has no Labels field. */
  rejectLabels = false;
  /** Throw on the next createIssues call after Jira has created the issues: a crash before we save. */
  crashAfterCreate = false;
  context: CreateContext = {
    projectId: "10000",
    issueTypeId: "10001",
    labels: true,
    priorities: ["Highest", "High", "Medium", "Low", "Lowest"].map((name, i) => ({
      id: String(i + 1),
      name,
    })),
  };

  async createContext() {
    return clone(this.context);
  }

  async createIssues(bodies: IssueBody[]) {
    if (bodies.length > 50) throw new Error("Jira bulk create takes at most 50 issues");
    this.bulkCalls++;
    const created: { index: number; id: string; key: string }[] = [];
    const failed: { index: number; message: string }[] = [];
    bodies.forEach((body, index) => {
      if (this.rejectLabels && body.fields.labels) {
        failed.push({
          index,
          message: "labels: Field 'labels' cannot be set. It is not on the appropriate screen.",
        });
        return;
      }
      const n = this.issues.length + 1;
      const issue = {
        id: String(20000 + n),
        key: `VAULT-${n}`,
        fields: clone(body.fields),
        property: clone(body.properties[0]!.value),
      };
      this.issues.push(issue);
      created.push({ index, id: issue.id, key: issue.key });
    });
    if (this.crashAfterCreate) {
      this.crashAfterCreate = false;
      throw new Error("connection reset");
    }
    return { created, failed };
  }

  async updateIssue(issueKey: string, fields: IssueFields) {
    const issue = this.issues.find((i) => i.key === issueKey);
    if (!issue) throw new Error(`no issue ${issueKey}`);
    issue.fields = { ...issue.fields, ...clone(fields) };
    this.updates.push(issueKey);
  }

  async setFindingProperty(issueKey: string, value: IssueProperty) {
    const issue = this.issues.find((i) => i.key === issueKey);
    if (!issue) throw new Error(`no issue ${issueKey}`);
    issue.property = clone(value);
  }

  async findAuditIssues(auditId: string) {
    return this.issues
      .filter((i) => i.property.auditId === auditId)
      .map((i) => ({ id: i.id, key: i.key, findingId: i.property.findingId }));
  }
}

export function makeDeps(overrides: Partial<Deps> = {}) {
  const store = new MemoryStore();
  const jira = new FakeJira();
  const jobs: ImportJob[] = [];
  let clock = 0;
  let ids = 0;
  const deps: Deps = {
    store,
    jira,
    userJira: { canCreateIssues: async () => true },
    queue: { push: async (job) => void jobs.push(job) },
    now: () => new Date(Date.UTC(2026, 10, 2, 9, 0, clock++)).toISOString(),
    newId: () => `a${String(++ids).padStart(9, "0")}`,
    ...overrides,
  };
  return { deps, store, jira, jobs };
}
