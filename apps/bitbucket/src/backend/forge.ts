import api, { assumeTrustedRoute, route } from "@forge/api";
import { kvs } from "@forge/kvs";
import type { BitbucketDiffstatEntry } from "@auditgate/drift";
import { ISSUE_PROPERTY_KEY } from "@auditgate/jira";
import {
  CheckError,
  NotFound,
  type Bitbucket,
  type FindingIssue,
  type Jira,
  type JiraConfig,
} from "./check";

const configKey = (repoUuid: string) => `jira-config:${repoUuid}`;

export async function loadConfig(repoUuid: string): Promise<JiraConfig | undefined> {
  return kvs.getSecret<JiraConfig>(configKey(repoUuid));
}

export async function saveConfig(repoUuid: string, config: JiraConfig): Promise<void> {
  await kvs.setSecret(configKey(repoUuid), config);
}

export async function deleteConfig(repoUuid: string): Promise<void> {
  await kvs.deleteSecret(configKey(repoUuid));
}

async function bitbucketJson<T>(path: ReturnType<typeof route>, what: string): Promise<T> {
  const res = await api.asApp().requestBitbucket(path, { headers: { Accept: "application/json" } });
  if (res.status === 404) throw new NotFound(`Bitbucket couldn't find ${what}.`);
  if (!res.ok) throw new CheckError(`Bitbucket refused to ${what} (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

/** Most diffs fit on one page. This is a guard against a runaway loop, not a real limit. */
const MAX_DIFFSTAT_PAGES = 20;

export const forgeBitbucket: Bitbucket = {
  async repoFullName(ws, repo) {
    const body = await bitbucketJson<{ full_name?: string }>(
      route`/2.0/repositories/${ws}/${repo}`,
      "read the repository",
    );
    if (!body.full_name) throw new CheckError("Bitbucket didn't return the repository name.");
    return body.full_name;
  },

  async sourceCommit(ws, repo, prId) {
    const body = await bitbucketJson<{ source?: { commit?: { hash?: string } } }>(
      route`/2.0/repositories/${ws}/${repo}/pullrequests/${prId}`,
      "read the pull request",
    );
    const hash = body.source?.commit?.hash;
    if (!hash) throw new CheckError("Bitbucket didn't return the pull request's latest commit.");
    return hash;
  },

  async diffstat(ws, repo, from, to) {
    // Bitbucket's spec is "<new>..<old>", the reverse of git diff. topic=false gives a plain
    // two-dot diff between the two commits instead of a merge-base diff. The ".." sits in the
    // template because route() rejects it inside a parameter.
    for (const sha of [from, to]) {
      if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new CheckError(`"${sha}" isn't a commit hash.`);
    }
    const values: BitbucketDiffstatEntry[] = [];
    let page = await bitbucketJson<{ values?: BitbucketDiffstatEntry[]; next?: string }>(
      route`/2.0/repositories/${ws}/${repo}/diffstat/${to}..${from}?topic=false&pagelen=500`,
      "compare the pull request with the audited commit",
    );
    for (let n = 1; ; n++) {
      values.push(...(page.values ?? []));
      if (!page.next || n >= MAX_DIFFSTAT_PAGES) break;
      const next = new URL(page.next);
      if (next.hostname !== "api.bitbucket.org" || !next.pathname.startsWith("/2.0/")) break;
      page = await bitbucketJson(
        assumeTrustedRoute(next.pathname + next.search),
        "read the next page of the diff",
      );
    }
    return values;
  },
};

function jiraBase(config: JiraConfig): string {
  return `https://api.atlassian.com/ex/jira/${encodeURIComponent(config.cloudId)}`;
}

function basicAuth(config: JiraConfig): string {
  return `Basic ${Buffer.from(`${config.email}:${config.token}`).toString("base64")}`;
}

/** JQL string literal: quotes and backslashes escaped. */
function jqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export const forgeJira: Jira = {
  async findingsForRepo(config, repo) {
    const found: FindingIssue[] = [];
    let nextPageToken: string | undefined;
    do {
      const res = await api.fetch(`${jiraBase(config)}/rest/api/3/search/jql`, {
        method: "POST",
        headers: {
          Authorization: basicAuth(config),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql: `issue.property[${ISSUE_PROPERTY_KEY}].repo = ${jqlString(repo)}`,
          fields: ["summary"],
          properties: [ISSUE_PROPERTY_KEY],
          maxResults: 100,
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      });
      if (res.status === 401 || res.status === 403) {
        throw new CheckError(
          "Jira rejected the email and API token saved for AuditGate. Check that the token hasn't expired and has the read:jira-work scope.",
        );
      }
      if (res.status === 404) {
        throw new CheckError("Jira couldn't find the site ID saved for AuditGate.");
      }
      if (!res.ok) throw new CheckError(`Jira didn't answer the search (HTTP ${res.status}).`);
      const page = (await res.json()) as {
        issues?: { key: string; properties?: Record<string, unknown> }[];
        nextPageToken?: string;
      };
      for (const issue of page.issues ?? []) {
        found.push({ key: issue.key, property: issue.properties?.[ISSUE_PROPERTY_KEY] });
      }
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);
    return found;
  },
};
