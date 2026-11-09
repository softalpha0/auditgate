import api, { route } from "@forge/api";
import {
  ISSUE_PROPERTY_KEY,
  pickIssueTypeId,
  type CreateContext,
  type IssueProperty,
} from "@auditgate/jira";
import { JiraError, type Jira, type UserJira } from "./ports";

type JsonResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

async function errorText(res: JsonResponse): Promise<string> {
  try {
    const body = (await res.json()) as {
      errorMessages?: string[];
      errors?: Record<string, string>;
    };
    const parts = [
      ...(body.errorMessages ?? []),
      ...Object.entries(body.errors ?? {}).map(([k, v]) => `${k}: ${v}`),
    ];
    return parts.join("; ") || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function expectOk(res: JsonResponse, what: string): Promise<void> {
  if (!res.ok) throw new JiraError(`Jira refused to ${what} (${await errorText(res)}).`);
}

interface CreateMetaField {
  fieldId: string;
  allowedValues?: { id: string; name?: string }[];
}

async function createMetaFields(
  projectId: string,
  issueTypeId: string,
): Promise<CreateMetaField[]> {
  const fields: CreateMetaField[] = [];
  let startAt = 0;
  for (;;) {
    const res = await api
      .asApp()
      .requestJira(
        route`/rest/api/3/issue/createmeta/${projectId}/issuetypes/${issueTypeId}?startAt=${startAt}&maxResults=100`,
      );
    await expectOk(res, "describe the project's create screen");
    const page = (await res.json()) as { fields?: CreateMetaField[]; total?: number };
    fields.push(...(page.fields ?? []));
    startAt += page.fields?.length ?? 0;
    if (!page.fields?.length || startAt >= (page.total ?? 0)) return fields;
  }
}

export const forgeJira: Jira = {
  async createContext(projectId) {
    const res = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue/createmeta/${projectId}/issuetypes?maxResults=100`);
    await expectOk(res, "list the project's issue types");
    const { issueTypes = [] } = (await res.json()) as {
      issueTypes?: { id: string; name: string; subtask?: boolean }[];
    };
    const issueTypeId = pickIssueTypeId(issueTypes);
    if (!issueTypeId)
      throw new JiraError(
        "This project has no issue type AuditGate can use. Add a Bug or Task type.",
      );

    const fields = await createMetaFields(projectId, issueTypeId);
    const priority = fields.find((f) => f.fieldId === "priority");
    const ctx: CreateContext = {
      projectId,
      issueTypeId,
      labels: fields.some((f) => f.fieldId === "labels"),
    };
    if (priority?.allowedValues?.length) {
      ctx.priorities = priority.allowedValues.map((v) => ({ id: v.id, name: v.name ?? "" }));
    }
    return ctx;
  },

  async createIssues(bodies) {
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ issueUpdates: bodies }),
    });
    // 400 is returned when every element failed; the body still has per-element errors.
    if (!res.ok && res.status !== 400 && res.status !== 201) {
      throw new JiraError(`Jira refused to create issues (${await errorText(res)}).`);
    }
    const body = (await res.json()) as {
      issues?: { id: string; key: string }[];
      errors?: {
        failedElementNumber: number;
        elementErrors?: { errorMessages?: string[]; errors?: Record<string, string> };
      }[];
    };
    const failedIdx = new Set((body.errors ?? []).map((e) => e.failedElementNumber));
    const okIdx = bodies.map((_, i) => i).filter((i) => !failedIdx.has(i));
    return {
      created: (body.issues ?? []).map((issue, n) => ({
        index: okIdx[n] as number,
        id: issue.id,
        key: issue.key,
      })),
      failed: (body.errors ?? []).map((e) => ({
        index: e.failedElementNumber,
        message:
          [
            ...(e.elementErrors?.errorMessages ?? []),
            ...Object.entries(e.elementErrors?.errors ?? {}).map(([k, v]) => `${k}: ${v}`),
          ].join("; ") || "unknown error",
      })),
    };
  },

  async updateIssue(issueKey, fields) {
    const res = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue/${issueKey}?notifyUsers=false`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
    await expectOk(res, `update ${issueKey}`);
  },

  async editPriorities(issueKey) {
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/editmeta`, {
      headers: { Accept: "application/json" },
    });
    await expectOk(res, `read the editable fields of ${issueKey}`);
    const body = (await res.json()) as {
      fields?: { priority?: { allowedValues?: { id: string; name?: string }[] } };
    };
    const allowed = body.fields?.priority?.allowedValues ?? [];
    return allowed.length ? allowed.map((v) => ({ id: v.id, name: v.name ?? "" })) : undefined;
  },

  async setPriority(issueKey, priorityId) {
    const res = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue/${issueKey}?notifyUsers=false`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { priority: { id: priorityId } } }),
      });
    await expectOk(res, `set the priority of ${issueKey}`);
  },

  async setFindingProperty(issueKey, value: IssueProperty) {
    const res = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue/${issueKey}/properties/${ISSUE_PROPERTY_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
    await expectOk(res, `save AuditGate data on ${issueKey}`);
  },

  async findAuditIssues(auditId) {
    const found: { id: string; key: string; findingId: string }[] = [];
    let nextPageToken: string | undefined;
    do {
      const res = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          jql: `issue.property[${ISSUE_PROPERTY_KEY}].auditId = "${auditId}"`,
          fields: ["summary"],
          properties: [ISSUE_PROPERTY_KEY],
          maxResults: 100,
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      });
      await expectOk(res, "search for this audit's issues");
      const page = (await res.json()) as {
        issues?: { id: string; key: string; properties?: Record<string, { findingId?: string }> }[];
        nextPageToken?: string;
      };
      for (const issue of page.issues ?? []) {
        const findingId = issue.properties?.[ISSUE_PROPERTY_KEY]?.findingId;
        if (findingId) found.push({ id: issue.id, key: issue.key, findingId });
      }
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);
    return found;
  },
  async getAssignees(issueKeys) {
    const out: Record<string, string | null> = {};
    if (issueKeys.length === 0) return out;
    const res = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        jql: `key in (${issueKeys.map((k) => `"${k.replace(/[^A-Za-z0-9-]/g, "")}"`).join(",")})`,
        fields: ["assignee"],
        maxResults: issueKeys.length,
      }),
    });
    await expectOk(res, "look up who owns these issues");
    const body = (await res.json()) as {
      issues?: { key: string; fields?: { assignee?: { displayName?: string } | null } }[];
    };
    for (const issue of body.issues ?? [])
      out[issue.key] = issue.fields?.assignee?.displayName ?? null;
    return out;
  },

  async getUserNames(accountIds) {
    const out: Record<string, string> = {};
    const ids = accountIds.filter((id) => /^[A-Za-z0-9:_-]+$/.test(id)).slice(0, 50);
    if (ids.length === 0) return out;
    const query = new URLSearchParams(ids.map((id) => ["accountId", id]));
    const res = await api.asApp().requestJira(route`/rest/api/3/user/bulk?${query}`);
    if (!res.ok) return out; // Names are a nicety; never fail an answer over them.
    const body = (await res.json()) as { values?: { accountId: string; displayName?: string }[] };
    for (const user of body.values ?? [])
      if (user.displayName) out[user.accountId] = user.displayName;
    return out;
  },
};

export const forgeUserJira: UserJira = {
  async canCreateIssues(projectId) {
    const res = await api
      .asUser()
      .requestJira(route`/rest/api/3/issue/createmeta/${projectId}/issuetypes?maxResults=1`);
    if (!res.ok) return false;
    const body = (await res.json()) as { issueTypes?: unknown[] };
    return (body.issueTypes?.length ?? 0) > 0;
  },

  async visibleProject(projectIdOrKey) {
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(projectIdOrKey)) return null;
    const res = await api.asUser().requestJira(route`/rest/api/3/project/${projectIdOrKey}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: string; key?: string; name?: string };
    return body.id && body.key
      ? { id: String(body.id), key: body.key, name: body.name ?? body.key }
      : null;
  },
};
