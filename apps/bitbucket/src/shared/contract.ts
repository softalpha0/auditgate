/** Shapes passed between the settings page and its resolver. */

export interface SettingsStatus {
  /** "workspace/slug", lowercase. */
  repo: string;
  connected: boolean;
  cloudId?: string;
  email?: string;
  /** Whether the check records drift on the Jira issues. */
  writeBack?: boolean;
  /** How the last write-back went, if there was one. */
  lastWriteBack?: {
    at: string;
    prId: number;
    commit: string;
    written: string[];
    failed: string[];
    error?: string;
  };
}

export interface SaveSettingsInput {
  cloudId: string;
  email: string;
  /** Leave empty to keep the token already saved. */
  token: string;
  /** Leave empty to keep the secret already saved. */
  signingSecret: string;
  /** Record drift on the Jira issues. Needs a token with write:jira-work too. */
  writeBack?: boolean;
}

export interface SaveSettingsResult {
  findings: number;
  audits: string[];
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const RESOLVERS = {
  getSettings: "getSettings",
  saveSettings: "saveSettings",
  disconnect: "disconnect",
} as const;
