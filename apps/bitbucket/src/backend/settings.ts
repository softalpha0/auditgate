import { verifyProperty, type IssueProperty } from "@auditgate/jira";
import type { SaveSettingsInput, SaveSettingsResult, SettingsStatus } from "../shared/contract";
import {
  CheckError,
  unwrapUuid,
  type Bitbucket,
  type Jira,
  type JiraConfig,
  type WriteBackStatus,
} from "./check";

/** A problem the admin can fix, shown on the settings page as is. */
export class SettingsError extends Error {
  override readonly name = "SettingsError";
}

export interface SettingsDeps {
  load(repoUuid: string): Promise<JiraConfig | undefined>;
  save(repoUuid: string, config: JiraConfig): Promise<void>;
  remove(repoUuid: string): Promise<void>;
  lastWriteBack?(repoUuid: string): Promise<WriteBackStatus | undefined>;
  jira: Jira;
}

export interface Where {
  repoUuid: string;
  repo: string;
}

/** The settings page URL is /{workspace}/{repo}/admin/forge/...; the repo name comes from it. */
export function repoFromLocation(location: string | undefined): string | undefined {
  if (!location) return undefined;
  try {
    const [workspace, slug] = new URL(location).pathname.split("/").filter(Boolean);
    return workspace && slug ? `${workspace}/${slug}`.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

/** What Forge passes a resolver on the repository settings page. */
export interface PageContext {
  workspaceId?: string;
  extension?: { repository?: { uuid?: string }; location?: string };
}

/**
 * Works out which repository the settings page is for. Resolvers get the workspace and
 * repository IDs (the page URL only reaches the frontend), so the name comes from Bitbucket.
 */
export async function resolveWhere(
  ctx: PageContext,
  bitbucket: Pick<Bitbucket, "repoFullName">,
): Promise<Where> {
  const repoUuid = ctx.extension?.repository?.uuid;
  if (!repoUuid) throw new SettingsError("Open this page from a repository's settings.");
  const fromUrl = repoFromLocation(ctx.extension?.location);
  if (fromUrl) return { repoUuid: unwrapUuid(repoUuid), repo: fromUrl };
  if (!ctx.workspaceId) {
    throw new SettingsError("Bitbucket didn't say which workspace this is. Reload the page.");
  }
  try {
    const repo = (await bitbucket.repoFullName(ctx.workspaceId, repoUuid)).toLowerCase();
    return { repoUuid: unwrapUuid(repoUuid), repo };
  } catch (error) {
    if (error instanceof Error) {
      throw new SettingsError(`Couldn't read this repository from Bitbucket: ${error.message}`);
    }
    throw error;
  }
}

export async function getSettings(deps: SettingsDeps, where: Where): Promise<SettingsStatus> {
  const config = await deps.load(where.repoUuid);
  if (!config) return { repo: where.repo, connected: false };
  const status: SettingsStatus = {
    repo: where.repo,
    connected: true,
    cloudId: config.cloudId,
    email: config.email,
    writeBack: config.writeBack === true,
  };
  const last = config.writeBack ? await deps.lastWriteBack?.(where.repoUuid) : undefined;
  if (last) status.lastWriteBack = last;
  return status;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET = /^[0-9a-f]{64}$/i;

/**
 * Checks the values against Jira before saving anything: a typo should show up here, not as a
 * failing merge check on someone's pull request.
 */
export async function saveSettings(
  deps: SettingsDeps,
  where: Where,
  input: SaveSettingsInput,
): Promise<SaveSettingsResult> {
  const existing = await deps.load(where.repoUuid);
  const config: JiraConfig = {
    cloudId: input.cloudId.trim(),
    email: input.email.trim(),
    token: input.token.trim() || existing?.token || "",
    signingSecret: input.signingSecret.trim() || existing?.signingSecret || "",
    writeBack: input.writeBack === true,
  };
  const problems: string[] = [];
  if (!UUID.test(config.cloudId)) {
    problems.push("The Jira site ID should look like 9b0cbf4e-290f-4451-a764-48f8ce6d207f.");
  }
  if (!/^[^\s@]+@[^\s@]+$/.test(config.email))
    problems.push("Enter the email of your Atlassian account.");
  if (!config.token) problems.push("Enter an API token.");
  if (!SECRET.test(config.signingSecret)) {
    problems.push("The signing secret is 64 characters, 0-9 and a-f. Copy it again from Jira.");
  }
  if (problems.length) throw new SettingsError(problems.join(" "));

  let issues;
  try {
    issues = await deps.jira.findingsForRepo(config, where.repo);
  } catch (error) {
    if (error instanceof CheckError) throw new SettingsError(`${error.message} Nothing was saved.`);
    throw error;
  }
  const verified = issues.filter((i) =>
    verifyProperty(i.property as IssueProperty, config.signingSecret),
  );
  if (issues.length && verified.length === 0) {
    throw new SettingsError(
      `Jira has ${issues.length} AuditGate findings for ${where.repo}, but none match this signing secret. In Jira, open AuditGate > Connect Bitbucket, click Sign issues, and copy the secret again. Nothing was saved.`,
    );
  }

  await deps.save(where.repoUuid, config);
  const audits = [...new Set(verified.map((i) => (i.property as IssueProperty).audit.name))].sort();
  return { findings: verified.length, audits };
}

export async function disconnect(deps: SettingsDeps, where: Where): Promise<void> {
  await deps.remove(where.repoUuid);
}
