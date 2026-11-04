import { kvs, WhereConditions } from "@forge/kvs";
import type { StoredFinding } from "@auditgate/jira";
import type { StoredAudit } from "../shared/contract";
import type { IssueLink, Store } from "./ports";

// Key layout. Keys allow letters, digits and ":._-#" plus spaces; ids here are hex or digits.
//   audit:<projectId>:<auditId>      StoredAudit
//   finding:<auditId>:<findingId>    StoredFinding
//   issue:<issueId>                  IssueLink
const auditKey = (projectId: string, auditId: string) => `audit:${projectId}:${auditId}`;
const findingKey = (auditId: string, findingId: string) => `finding:${auditId}:${findingId}`;
const issueKey = (issueId: string) => `issue:${issueId}`;

const PAGE = 100; // KVS query maximum
const BATCH = 25; // KVS batch maximum

async function listByPrefix<T>(prefix: string): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    let query = kvs.query().where("key", WhereConditions.beginsWith(prefix)).limit(PAGE);
    if (cursor) query = query.cursor(cursor);
    const page = await query.getMany<T>();
    out.push(...page.results.map((r) => r.value));
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

async function batchSet<T>(items: { key: string; value: T }[]): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH) {
    const result = await kvs.batchSet(items.slice(i, i + BATCH));
    if (result.failedKeys.length) {
      throw new Error(`Storage refused ${result.failedKeys.length} item(s); try again.`);
    }
  }
}

export const forgeStore: Store = {
  getAudit: (projectId, auditId) => kvs.get<StoredAudit>(auditKey(projectId, auditId)),
  listAudits: (projectId) => listByPrefix<StoredAudit>(`audit:${projectId}:`),
  putAudit: (audit) => kvs.set(auditKey(audit.projectId, audit.id), audit),
  listFindings: (auditId) => listByPrefix<StoredFinding>(`finding:${auditId}:`),
  getFinding: (auditId, findingId) => kvs.get<StoredFinding>(findingKey(auditId, findingId)),
  putFindings: (findings) =>
    batchSet(findings.map((f) => ({ key: findingKey(f.auditId, f.id), value: f }))),
  getIssueLink: (issueId) => kvs.get<IssueLink>(issueKey(issueId)),
  putIssueLinks: (links) => batchSet(links.map((l) => ({ key: issueKey(l.issueId), value: l }))),
};
